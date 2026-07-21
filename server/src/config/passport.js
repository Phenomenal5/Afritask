import passport from "passport";
import googleOauth from "passport-google-oauth20";
import User from "../models/User.js";
import logger from "../utils/logger.js";

// NOTE: no serializeUser/deserializeUser here on purpose. This app is fully
// stateless — every passport.authenticate() call uses { session: false } and
// there's no express-session/passport.session() middleware. Session
// serializers would be dead code; auth state lives entirely in the JWT.

// Google Oauth Strategy
const { Strategy: GoogleStrategy } = googleOauth;

const hasGoogleCredentials =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

if (hasGoogleCredentials) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
      },

      async (accessToken, refreshToken, profile, done) => {
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
            logger.info(`Google OAuth login for existing provider user ${email}`);
            return done(null, existingUser);
          }

          const userWithEmail = await User.findOne({ email });

          if (userWithEmail) {
            // Link Google to an existing account with the same verified email.
            userWithEmail.provider = "google";
            userWithEmail.providerId = profile.id;
            userWithEmail.isVerified = true;
            await userWithEmail.save();

            logger.info(`Google OAuth linked existing user ${email} with provider account`);
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
          return done(null, newUser);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );
}


