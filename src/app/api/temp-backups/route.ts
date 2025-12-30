
/**
 * @fileoverview API Route to securely serve temporary backup files for download.
 * This route handler is responsible for taking a filename from a query parameter,
 * safely resolving its path within a dedicated temporary directory, and streaming
 * it back to the client for download. It includes security checks to prevent
 * path traversal attacks.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPDATE_BACKUP_DIR = 'update_backups';
const dbDirectory = path.join(process.cwd(), 'dbs');

/**
 * Handles GET requests to download a temporary backup file.
 * @param {NextRequest} request - The incoming Next.js request object.
 * @returns {Promise<NextResponse>} A response object containing the file stream or an error.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');

    if (!fileName) {
        return new NextResponse('Filename is required', { status: 400 });
    }

    // --- Security Check: Prevent path traversal attacks ---
    const sanitizedFileName = path.basename(fileName);
    if (sanitizedFileName !== fileName) {
        return new NextResponse('Invalid filename', { status: 400 });
    }

    const backupDir = path.join(dbDirectory, UPDATE_BACKUP_DIR);
    const filePath = path.join(backupDir, sanitizedFileName);
    
    // --- Existence Check ---
    if (!fs.existsSync(filePath)) {
        console.error(`Backup file not found at path: ${filePath}`);
        return new NextResponse('File not found', { status: 404 });
    }

    try {
        const stats = fs.statSync(filePath);
        const dataStream = fs.createReadStream(filePath);
        
        // This is a type assertion needed because Next.js NextResponse expects a specific stream type.
        const readableStream = new ReadableStream({
            start(controller) {
                dataStream.on('data', (chunk) => controller.enqueue(chunk));
                dataStream.on('end', () => controller.close());
                dataStream.on('error', (err) => controller.error(err));
            },
        });

        const headers = new Headers();
        headers.set('Content-Type', 'application/x-sqlite3');
        headers.set('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
        headers.set('Content-Length', String(stats.size));

        return new NextResponse(readableStream as any, { status: 200, headers });

    } catch (error: any) {
        console.error(`Failed to read backup file: ${error.message}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
