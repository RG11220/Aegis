import type { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.log("Error:", err.message);

    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

    res.status(statusCode).json({
        message: err.message || 'internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};