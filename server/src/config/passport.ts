import passport from "passport";
import googleOauth, { type Profile, type VerifyCallback } from "passport-google-oauth20";
import User from "../models/User.js";
import { deliverWelcomeEmail } from "../utils/email.js";
import logger from "../utils/logger.js";
import env from "./env.js";

// NOTE: no serializeUser/deserializeUser here on purpose. This app is fully
// stateless — every passport.authenticate() call uses { session: false } and
// there's no express-session/passport.session() middleware. Session
// serializers would be dead code; auth state lives entirely in the JWT.

// Google Oauth Strategy
const { Strategy: GoogleStrategy } = googleOauth;

const { googleClientId, googleClientSecret } = env;

if (googleClientId && googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: env.googleCallbackUrl,
      },

      async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            logger.warn("Google OAuth failed: account has no email");
            return done(null, false, {
              message: "Google account has no email",
            });
          }

          // Check if this Google account is already linked to a user.
          const existingUser = await User.findOne({
            provider: "google",
            providerId: profile.id,
          });

          if (existingUser) {
            // A returning sign-in, not a signup — no welcome email here, or
            // every Google login would re-send it.
            logger.info(`Google OAuth login for existing provider user ${email}`);
            return done(null, existingUser);
          }

          // The verification token fields are select: false, but the linking
          // branch below has to clear them — so pull them in explicitly.
          const userWithEmail = await User.findOne({ email }).select(
            "+verifyEmailToken +verifyEmailExpires"
          );

          if (userWithEmail) {
            // Link Google to an existing account with the same verified email.
            // NOTE: for local signups the welcome email only goes out in
            // verifyEmail, so an account still sitting unverified has never
            // received one — Google finishing the signup is its welcome moment.
            const isFirstActivation = !userWithEmail.isVerified;

            userWithEmail.provider = "google";
            userWithEmail.providerId = profile.id;
            userWithEmail.isVerified = true;
            // Google already proved ownership of the address, so retire the
            // pending token. Leaving it live would let the old verification
            // link run verifyEmail later and fire a SECOND welcome email.
            userWithEmail.verifyEmailToken = undefined;
            userWithEmail.verifyEmailExpires = undefined;
            await userWithEmail.save();

            logger.info(`Google OAuth linked existing user ${email} with provider account`);

            if (isFirstActivation) {
              await deliverWelcomeEmail(userWithEmail.email, userWithEmail.name);
            }

            return done(null, userWithEmail);
          }

          // If not, create a new user using the data from Google.
          const newUser = new User({
            provider: "google",
            providerId: profile.id,
            name: profile.displayName,
            email,
            isVerified: true,
          });

          await newUser.save();
          logger.info(`Google OAuth created new user ${email}`);

          // Google signups never touch the verify-email flow, so this is the
          // only place their welcome email can be sent.
          await deliverWelcomeEmail(newUser.email, newUser.name);

          return done(null, newUser);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );
}
