const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const configPath = path.join(__dirname, '..', 'dev.config.json');

// Files to copy
const filesToCopy = ['main.js', 'styles.css', 'manifest.json'];

if (fs.existsSync(configPath)) {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const targetDir = config.pluginPath;

        if (targetDir) {
            console.log(`Deploying to: ${targetDir}`);

            // Create directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Copy files
            filesToCopy.forEach(file => {
                const source = path.join(__dirname, '..', file);
                const dest = path.join(targetDir, file);
                fs.copyFileSync(source, dest);
                console.log(`Copied ${file}`);
            });

            console.log('Deployment complete.');
        } else {
            console.log('No pluginPath defined in dev.config.json. Skipping deployment.');
        }
    } catch (e) {
        console.error('Error reading dev.config.json or deploying:', e);
        process.exit(1);
    }
} else {
    console.log('dev.config.json not found. Skipping deployment.');
}
