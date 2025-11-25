import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import chalk from "chalk";

/**
 * Keys that are allowed to exist in .env but not in .env.example
 * These are environment-specific variables that should not be synced
 */
const IGNORED_KEYS = new Set(["SERVER_IS_DEMO_ENV", "SERVER_DEMO_POST_WHITELIST"]);

/**
 * Parse env file content into structured data
 * @param {string} content - The content of the env file
 * @returns {Array<{type: 'comment'|'empty'|'variable', content: string, key?: string, value?: string}>}
 */
function parseEnvFile(content) {
    const lines = content.split("\n");
    const parsed = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Empty line
        if (trimmed === "") {
            parsed.push({ type: "empty", content: line });
            continue;
        }

        // Comment line
        if (trimmed.startsWith("#")) {
            parsed.push({ type: "comment", content: line });
            continue;
        }

        // Variable line
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2];
            parsed.push({
                type: "variable",
                content: line,
                key,
                value,
            });
        } else {
            // Malformed line, treat as comment
            parsed.push({ type: "comment", content: line });
        }
    }

    return parsed;
}

/**
 * Build a map of existing variables from .env file
 * @param {Array} parsedEnv - Parsed env data
 * @returns {Map<string, string>}
 */
function buildExistingVariablesMap(parsedEnv) {
    const map = new Map();
    for (const item of parsedEnv) {
        if (item.type === "variable") {
            map.set(item.key, item.value);
        }
    }
    return map;
}

/**
 * Sync .env file with .env.example
 * @param {string} examplePath - Path to .env.example
 * @param {string} envPath - Path to .env
 */
function syncEnvFile(examplePath, envPath) {
    // Check if .env.example exists
    if (!existsSync(examplePath)) {
        console.log(chalk.red("❌ .env.example file not found"));
        process.exit(1);
    }

    // Read .env.example
    const exampleContent = readFileSync(examplePath, "utf-8");
    const parsedExample = parseEnvFile(exampleContent);

    // Build a set of valid keys from .env.example
    const exampleKeys = new Set();
    for (const item of parsedExample) {
        if (item.type === "variable") {
            exampleKeys.add(item.key);
        }
    }

    // Read .env if exists, otherwise create empty
    let parsedEnv = [];
    let existingVariables = new Map();

    if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf-8");
        parsedEnv = parseEnvFile(envContent);
        existingVariables = buildExistingVariablesMap(parsedEnv);
    }

    // Track changes
    const addedKeys = [];
    const removedKeys = [];
    const keptKeys = [];

    // Find removed keys (exist in .env but not in .env.example)
    for (const [key] of existingVariables) {
        if (!exampleKeys.has(key) && !IGNORED_KEYS.has(key)) {
            removedKeys.push(key);
        }
    }

    // Build result by iterating through .env.example
    const result = [];

    for (const item of parsedExample) {
        if (item.type === "variable") {
            // Check if variable exists in .env
            if (existingVariables.has(item.key)) {
                // IMPORTANT: Use existing value from .env, never overwrite
                const existingValue = existingVariables.get(item.key);
                result.push(`${item.key}=${existingValue}`);
                keptKeys.push(item.key);
            } else {
                // New variable from .env.example
                result.push(item.content);
                addedKeys.push(item.key);
            }
        } else {
            // Keep comments and empty lines from .env.example
            result.push(item.content);
        }
    }

    // Check if there are any changes
    const hasChanges = addedKeys.length > 0 || removedKeys.length > 0;

    if (!hasChanges) {
        console.log(chalk.blue("ℹ No changes detected. .env is already in sync with .env.example"));
        return;
    }

    // Display changes summary
    console.log("");
    if (addedKeys.length > 0) {
        console.log(chalk.green(`✓ Added ${addedKeys.length} new variable(s):`));
        addedKeys.forEach((key) => {
            console.log(chalk.green(`  + ${key}`));
        });
    }

    if (removedKeys.length > 0) {
        console.log("");
        console.log(chalk.yellow(`⚠ Removed ${removedKeys.length} obsolete variable(s):`));
        removedKeys.forEach((key) => {
            console.log(chalk.yellow(`  - ${key}`));
        });
    }

    if (keptKeys.length > 0) {
        console.log("");
        console.log(chalk.blue(`ℹ Kept ${keptKeys.length} existing variable(s) with their original values`));
    }

    // Write back to .env
    const newContent = result.join("\n");
    writeFileSync(envPath, newContent, "utf-8");

    console.log("");
    console.log(chalk.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.green("✓ .env file synced successfully"));
    console.log(chalk.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
}

/**
 * Main function
 */
function main() {
    console.log(chalk.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(chalk.blue("📋 Syncing .env file with .env.example"));
    console.log(chalk.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

    const cwd = process.cwd();
    const examplePath = path.resolve(cwd, ".env.example");
    const envPath = path.resolve(cwd, ".env");

    syncEnvFile(examplePath, envPath);
}

main();
