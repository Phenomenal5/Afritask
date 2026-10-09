import mongoose, { type HydratedDocument, type Model } from "mongoose"
import validator from "validator";
import bcrypt from "bcrypt";

export interface IUser {
    name: string;
    email: string;
    age?: number;
    photo?: string;
    password?: string;
    role: "user" | "admin";
    provider: "local" | "google";
    providerId?: string;
    isVerified: boolean;
    verifyEmailToken?: string;
    verifyEmailExpires?: Date;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    createdAt: Date;
    updatedAt: Date;
}

interface IUserMethods {
    comparePassword(password: string): Promise<boolean>;
}

type UserModel = Model<IUser, {}, IUserMethods>;

export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new mongoose.Schema<IUser, UserModel, IUserMethods>({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        validate: [validator.isEmail, "Invalid email address"]
    },
    age: {
        type: Number,
        min: [0, "Age must be a positive number"]
    },
    photo: String,
    password: {
      type: String,
      required: function(this: IUser) {
        return this.provider === "local";
      },
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role : {
        type : String,
        enum : ["user", "admin"],
        default : "user"
    },
    provider: {
        type: String,
        enum: ["local", "google"],
        default: "local"
    },
    providerId: {
        type: String,
        unique: true,
        sparse: true // allow multiple null values for local users
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verifyEmailToken: {
        type: String,
        select: false
    },
    verifyEmailExpires: {
        type: Date,
        select: false
    },
    resetPasswordToken: {
        type: String,
        select: false
    },
    resetPasswordExpires: {
        type: Date,
        select: false
    }
},{
    timestamps: true
});


// Hash the password before saving the user
userSchema.pre("save", async function() {
    if (!this.isModified("password") || !this.password) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
})


// compare the password with the hashed password
// NOTE: password is select:false — callers must .select("+password") first,
// otherwise there is no hash to compare against and the login always fails.
userSchema.methods.comparePassword = async function(password: string) {
    if (!this.password) return false;
    return await bcrypt.compare(password, this.password);
}


export default mongoose.model<IUser, UserModel>("User", userSchema);
