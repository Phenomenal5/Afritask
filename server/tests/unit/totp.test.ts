// Unit: TOTP (RFC 6238) and the MFA secret encryption.
import { describe, expect, it } from "@jest/globals";
import { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totpCode, verifyTotp } from "../../src/utils/totp.js";
import { decryptSecret, encryptSecret } from "../../src/utils/secretBox.js";

// RFC 6238 Appendix B uses the ASCII secret "12345678901234567890" (SHA-1). Its 8-digit
// codes end in the 6-digit codes authenticator apps show.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
    it("matches the RFC 6238 test vectors", () => {
        expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
        expect(totpCode(RFC_SECRET, 59_000)).toBe("287082");
        expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe("081804");
        expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe("005924");
        expect(totpCode(RFC_SECRET, 20_000_000_000_000)).toBe("353130");
    });

    it("accepts ±1 step of clock drift and nothing further", () => {
        const now = 1_700_000_000_000;
        expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now)).not.toBeNull();
        expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now)).not.toBeNull();
        expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now)).toBeNull();
        expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
        expect(verifyTotp(RFC_SECRET, { code: "123456" }, now)).toBeNull();
    });

    it("round-trips base32 and builds an importable otpauth URI", () => {
        const secret = generateTotpSecret();
        expect(secret).toMatch(/^[A-Z2-7]{32}$/);
        expect(base32Encode(base32Decode(secret))).toBe(secret);
        expect(otpauthUri(secret, "ops@afritask.invalid")).toBe(
            `otpauth://totp/Afritask%20Admin%3Aops%40afritask.invalid?secret=${secret}&issuer=Afritask%20Admin&algorithm=SHA1&digits=6&period=30`
        );
    });
});

describe("secret encryption", () => {
    it("encrypts with a fresh IV and decrypts back; tampering fails", () => {
        const first = encryptSecret("JBSWY3DPEHPK3PXP");
        const second = encryptSecret("JBSWY3DPEHPK3PXP");
        expect(first).not.toBe(second);
        expect(first).not.toContain("JBSWY3DPEHPK3PXP");
        expect(decryptSecret(first)).toBe("JBSWY3DPEHPK3PXP");

        const [iv, tag, ciphertext] = first.split(".");
        const tampered = [iv, tag, Buffer.from("x" + Buffer.from(ciphertext!, "base64").toString("latin1"), "latin1").toString("base64")].join(".");
        expect(() => decryptSecret(tampered)).toThrow();
    });
});
