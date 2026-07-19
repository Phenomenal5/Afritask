import mongoose from "mongoose"
import validator from "validator";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({
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
      required: function() {
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
userSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
}


export default mongoose.model("User", userSchema);
