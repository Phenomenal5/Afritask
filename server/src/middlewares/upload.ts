import multer, { type Options } from 'multer'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import AppError from '../utils/AppError.js'


const uploadDirectory = path.resolve('public/uploads/profile');
// ensure destination directory exists
if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        // NOTE: was `user-${Date.now()}` — two uploads in the same millisecond overwrote each other.
        callback(null, `user-${randomUUID()}${extension}`);
    }
});

const imageFileFilter: Options['fileFilter'] = (req, file, callback) => {
    const allowedExt = ['.png', '.jpg', '.jpeg', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.includes(ext) || !file.mimetype.startsWith('image/')) {
        // AppError (400), not a bare Error — the error handler turned that into a generic 500.
        return callback(new AppError('Only image files (png, jpg, jpeg, gif) are allowed', 400));
    }
    callback(null, true);
};

export const upload = multer({
    storage,
    limits: {
        fileSize: 1024 * 1024 * 5 // 5MB
    },
    fileFilter: imageFileFilter
});