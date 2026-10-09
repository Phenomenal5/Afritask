import multer, { type Options } from 'multer'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import AppError from '../utils/AppError.js'


const uploadDir = path.resolve('public/uploads/profile');
// ensure destination directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const uniqueExt = path.extname(file.originalname).toLowerCase();
        // NOTE: was `user-${Date.now()}` — two uploads in the same millisecond overwrote each other.
        cb(null, `user-${randomUUID()}${uniqueExt}`);
    }
});

const imageFileFilter: Options['fileFilter'] = (req, file, cb) => {
    const allowedExt = ['.png', '.jpg', '.jpeg', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.includes(ext) || !file.mimetype.startsWith('image/')) {
        // AppError (400), not a bare Error — the error handler turned that into a generic 500.
        return cb(new AppError('Only image files (png, jpg, jpeg, gif) are allowed', 400));
    }
    cb(null, true);
};

export const upload = multer({
    storage,
    limits: {
        fileSize: 1024 * 1024 * 5 // 5MB
    },
    fileFilter: imageFileFilter
});