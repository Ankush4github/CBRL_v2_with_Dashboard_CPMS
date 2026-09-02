const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '../public/images');
const BACKUP_DIR = path.join(__dirname, '../public/images-backup');

// Configuration
const CONFIG = {
    // Quality settings
    webpQuality: 80,
    jpegQuality: 85,

    // Size thresholds (in KB)
    minSizeToOptimize: 100,

    // Max dimensions for different image types
    maxDimensions: {
        memberPhoto: { width: 800, height: 800 },
        gallery: { width: 1920, height: 1080 },
        facility: { width: 1920, height: 1080 },
        logo: null, // Keep original size
    },

    // File extensions to process
    extensions: ['.jpg', '.jpeg', '.png'],

    // Directories and their image types
    directoryTypes: {
        'MembersDP': 'memberPhoto',
        'AlumniDP': 'memberPhoto',
        'InternsDP': 'memberPhoto',
        'gallery': 'gallery',
        'facilities': 'facility',
        'Collab': 'logo',
        'sponsors': 'logo',
        'photo': 'gallery',
    }
};

// Statistics
const stats = {
    processed: 0,
    skipped: 0,
    errors: 0,
    originalSize: 0,
    optimizedSize: 0,
};

/**
 * Get file size in KB
 */
async function getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size / 1024;
}

/**
 * Determine image type based on directory
 */
function getImageType(filePath) {
    for (const [dir, type] of Object.entries(CONFIG.directoryTypes)) {
        if (filePath.includes(path.sep + dir + path.sep)) {
            return type;
        }
    }
    return 'logo'; // Default
}

/**
 * Get max dimensions for image type
 */
function getMaxDimensions(imageType) {
    return CONFIG.maxDimensions[imageType] || null;
}

/**
 * Optimize a single image
 */
async function optimizeImage(inputPath, outputPath, imageType) {
    try {
        const originalSize = await getFileSize(inputPath);

        // Skip if file is too small
        if (originalSize < CONFIG.minSizeToOptimize) {
            stats.skipped++;
            console.log(`⏭️  Skipped (too small): ${path.basename(inputPath)} (${originalSize.toFixed(2)} KB)`);
            return;
        }

        const ext = path.extname(inputPath).toLowerCase();
        const maxDim = getMaxDimensions(imageType);

        let pipeline = sharp(inputPath);

        // Get image metadata
        const metadata = await pipeline.metadata();

        // Resize if needed
        if (maxDim && (metadata.width > maxDim.width || metadata.height > maxDim.height)) {
            pipeline = pipeline.resize(maxDim.width, maxDim.height, {
                fit: 'inside',
                withoutEnlargement: true,
            });
        }

        // Convert to WebP for PNG and large JPEG files
        if (ext === '.png' || originalSize > 500) {
            const webpPath = outputPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');
            const tempPath = webpPath + '.tmp';

            await pipeline
                .webp({ quality: CONFIG.webpQuality })
                .toFile(tempPath);

            // Move temp file to final location
            await fs.rename(tempPath, webpPath);

            const optimizedSize = await getFileSize(webpPath);
            stats.originalSize += originalSize;
            stats.optimizedSize += optimizedSize;
            stats.processed++;

            const reduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
            console.log(`✅ ${path.basename(inputPath)} → ${path.basename(webpPath)}`);
            console.log(`   ${originalSize.toFixed(2)} KB → ${optimizedSize.toFixed(2)} KB (${reduction}% reduction)`);
        } else {
            // Just compress JPEG
            const tempPath = outputPath + '.tmp';

            await pipeline
                .jpeg({ quality: CONFIG.jpegQuality, progressive: true })
                .toFile(tempPath);

            // Move temp file to final location
            await fs.rename(tempPath, outputPath);

            const optimizedSize = await getFileSize(outputPath);
            stats.originalSize += originalSize;
            stats.optimizedSize += optimizedSize;
            stats.processed++;

            const reduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
            console.log(`✅ ${path.basename(inputPath)}`);
            console.log(`   ${originalSize.toFixed(2)} KB → ${optimizedSize.toFixed(2)} KB (${reduction}% reduction)`);
        }
    } catch (error) {
        stats.errors++;
        console.error(`❌ Error processing ${inputPath}:`, error.message);
    }
}

/**
 * Process all images in a directory recursively
 */
async function processDirectory(dir, backupDir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const inputPath = path.join(dir, entry.name);
        const relativePath = path.relative(IMAGES_DIR, inputPath);
        const backupPath = path.join(backupDir, relativePath);

        if (entry.isDirectory()) {
            // Create backup directory
            await fs.mkdir(path.join(backupDir, relativePath), { recursive: true });
            // Process subdirectory
            await processDirectory(inputPath, backupDir);
        } else {
            const ext = path.extname(entry.name).toLowerCase();

            if (CONFIG.extensions.includes(ext)) {
                // Create backup directory if needed
                await fs.mkdir(path.dirname(backupPath), { recursive: true });

                // Copy original to backup
                await fs.copyFile(inputPath, backupPath);

                // Optimize image
                const imageType = getImageType(inputPath);
                await optimizeImage(inputPath, inputPath, imageType);
            }
        }
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🖼️  Image Optimization Script\n');
    console.log('Configuration:');
    console.log(`  WebP Quality: ${CONFIG.webpQuality}%`);
    console.log(`  JPEG Quality: ${CONFIG.jpegQuality}%`);
    console.log(`  Min size to optimize: ${CONFIG.minSizeToOptimize} KB\n`);

    try {
        // Create backup directory
        console.log('📦 Creating backup directory...');
        await fs.mkdir(BACKUP_DIR, { recursive: true });

        // Process all images
        console.log('🔄 Processing images...\n');
        await processDirectory(IMAGES_DIR, BACKUP_DIR);

        // Print statistics
        console.log('\n📊 Optimization Complete!\n');
        console.log('Statistics:');
        console.log(`  Processed: ${stats.processed} images`);
        console.log(`  Skipped: ${stats.skipped} images (too small)`);
        console.log(`  Errors: ${stats.errors}`);
        console.log(`  Original size: ${(stats.originalSize / 1024).toFixed(2)} MB`);
        console.log(`  Optimized size: ${(stats.optimizedSize / 1024).toFixed(2)} MB`);

        if (stats.originalSize > 0) {
            const totalReduction = ((stats.originalSize - stats.optimizedSize) / stats.originalSize * 100).toFixed(1);
            console.log(`  Total reduction: ${totalReduction}%`);
            console.log(`  Space saved: ${((stats.originalSize - stats.optimizedSize) / 1024).toFixed(2)} MB`);
        }

        console.log('\n✨ Backup created at: public/images-backup/');
        console.log('💡 Next steps:');
        console.log('   1. Review optimized images');
        console.log('   2. Update image references in code to use .webp extensions');
        console.log('   3. Test the website');
        console.log('   4. Commit changes if satisfied\n');

    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
main();
