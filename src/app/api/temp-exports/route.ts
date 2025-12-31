
/**
 * @fileoverview API Route to securely serve temporary export files for download.
 * This route handler is responsible for taking a filename from a query parameter,
 * safely resolving its path within a dedicated temporary directory, and streaming
 * it back to the client for download. It includes security checks to prevent
 * path traversal attacks.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEMP_EXPORT_DIR = path.join(process.cwd(), 'temp_files', 'exports');

/**
 * Handles GET requests to download a temporary export file.
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

    const filePath = path.join(TEMP_EXPORT_DIR, sanitizedFileName);
    
    // --- Existence Check ---
    if (!fs.existsSync(filePath)) {
        console.error(`Temporary export file not found at path: ${filePath}`);
        return new NextResponse('File not found', { status: 404 });
    }

    try {
        const stats = fs.statSync(filePath);
        const dataStream = fs.createReadStream(filePath);
        
        // Use Node.js Readable stream and cast it for NextResponse
        const readableStream = Readable.toWeb(dataStream) as ReadableStream<Uint8Array>;

        const headers = new Headers();
        // Set a generic content type for Excel files
        headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        headers.set('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
        headers.set('Content-Length', String(stats.size));

        return new NextResponse(readableStream, { status: 200, headers });

    } catch (error: any) {
        console.error(`Failed to read export file: ${error.message}`);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
