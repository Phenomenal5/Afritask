import multer from 'multer'
import path from 'path'
import fs from 'fs'


const uploadDir = path.resolve('public/uploads/profile');
// ensure destination directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const uniqueExt = path.extname(file.originalname).toLowerCase();
        cb(null, `user-${Date.now()}${uniqueExt}`);
    }
});

const imageFileFilter = (req, file, cb) => {
    const allowedExt = ['.png', '.jpg', '.jpeg', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.includes(ext) || !file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files (png, jpg, jpeg, gif) are allowed'), false);
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