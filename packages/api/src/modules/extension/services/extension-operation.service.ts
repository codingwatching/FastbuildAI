import { createDataSourceConfig } from "@buildingai/config/db.config";
import { ExtensionDownload, ExtensionDownloadType } from "@buildingai/constants";
import {
    ExtensionStatus,
    type ExtensionSupportTerminalType,
    type ExtensionTypeType,
} from "@buildingai/constants/shared/extension.constant";
import type { CreateExtensionDto } from "@buildingai/core/modules/extension/dto/create-extension.dto";
import { ExtensionDetailType } from "@buildingai/core/modules/extension/interfaces/extension-market.interface";
import { ExtensionsService } from "@buildingai/core/modules/extension/services/extension.service";
import { ExtensionConfigService } from "@buildingai/core/modules/extension/services/extension-config.service";
import { ExtensionSchemaService } from "@buildingai/core/modules/extension/services/extension-schema.service";
import { getExtensionSchemaName } from "@buildingai/core/modules/extension/utils/extension.utils";
import { FileUploadService } from "@buildingai/core/modules/upload/services/file-upload.service";
import { SeedRunner } from "@buildingai/db/seeds/seed-runner";
import { BaseSeeder } from "@buildingai/db/seeds/seeders/base.seeder";
import { DataSource } from "@buildingai/db/typeorm";
import { DictService } from "@buildingai/dict";
import { HttpErrorFactory } from "@buildingai/errors";
import { createHttpClient, HttpClientInstance } from "@buildingai/utils";
import { Injectable, Logger } from "@nestjs/common";
import AdmZip from "adm-zip";
import * as fs from "fs-extra";
import * as path from "path";
import * as semver from "semver";
import { v4 as uuidv4 } from "uuid";

import { Pm2Service } from "../../pm2/services/pm2.service";
import { ExtensionMarketService } from "./extension-market.service";

/**
 * Extension market service
 */
@Injectable()
export class ExtensionOperationService {
    private readonly logger = new Logger(ExtensionOperationService.name);
    private readonly httpClient: HttpClientInstance;
    private readonly rootDir: string;
    private readonly tempDir: string;
    private readonly extensionsDir: string;
    private readonly templatesDir: string;
    private readonly publicWebDir: string;

    // Static variables for restart debouncing
    private static restartScheduled = false;
    private static restartTimer: NodeJS.Timeout | null = null;
    private static readonly RESTART_DEBOUNCE_MS = 3000; // 3 seconds debounce

    constructor(
        private readonly dictService: DictService,
        private readonly extensionsService: ExtensionsService,
        private readonly extensionConfigService: ExtensionConfigService,
        private readonly extensionSchemaService: ExtensionSchemaService,
        private readonly pm2Service: Pm2Service,
        private readonly dataSource: DataSource,
        private readonly fileUploadService: FileUploadService,
    ) {
        // 初始化临时目录路径
        this.rootDir = path.join(process.cwd(), "..", "..");
        this.tempDir = path.join(this.rootDir, "storage", "temp");
        // 确保临时目录存在
        fs.ensureDirSync(this.tempDir);

        this.extensionsDir = path.join(this.rootDir, "extensions");
        fs.ensureDirSync(this.extensionsDir);

        this.templatesDir = path.join(this.rootDir, "templates");

        this.publicWebDir = path.join(this.rootDir, "public", "web", "extensions");
        fs.ensureDirSync(this.publicWebDir);

        this.httpClient = createHttpClient({
            timeout: 30000,
            autoTransformResponse: false,
            retryConfig: {
                retries: 2,
                retryDelay: 1000,
            },
            logConfig: {
                enableErrorLog: true,
            },
        });
    }

    /**
     * 卸载扩展
     *
     * @param identifier 扩展标识符
     */
    async uninstall(identifier: string): Promise<void> {
        if (!identifier) {
            throw HttpErrorFactory.badRequest("Extension identifier is required");
        }

        this.logger.log(`Starting uninstall process for extension: ${identifier}`);

        // 1. Find extension in database
        const extension = await this.extensionsService.findByIdentifier(identifier);
        if (!extension) {
            throw HttpErrorFactory.notFound(`Extension not found: ${identifier}`);
        }

        // 2. Remove extension directory
        const safeIdentifier = this.toSafeName(identifier);
        const extensionDir = path.join(this.extensionsDir, safeIdentifier);

        if (await fs.pathExists(extensionDir)) {
            this.logger.log(`Removing extension directory: ${extensionDir}`);
            await fs.remove(extensionDir);
        } else {
            this.logger.warn(`Extension directory not found: ${extensionDir}`);
        }

        // 3. Remove web assets from public directory
        await this.removeWebAssets(identifier);

        // 4. Remove extension from extensions.json
        await this.extensionConfigService.removeExtension(identifier);

        // 5. Delete file records associated with this extension
        await this.deleteExtensionFiles(identifier);

        // 6. Drop extension database schema (if exists)
        await this.dropExtensionSchemaWrapper(identifier);

        // 7. Delete extension from database
        await this.extensionsService.delete(extension.id);

        // 8. Schedule PM2 restart after response is sent
        this.scheduleRestart();

        this.logger.log(`Extension uninstalled successfully: ${identifier}`);
    }

    /**
     * 下载并解压扩展包到插件目录
     *
     * @param url 下载链接
     * @returns 返回插件安装信息
     */
    async download(
        url: string,
        identifier: string,
        type: ExtensionDownloadType,
        version?: string,
    ): Promise<{
        identifier: string;
        version?: string;
        pluginDir: string;
        packagePath: string;
    }> {
        try {
            if (!identifier) {
                throw HttpErrorFactory.badRequest("Extension identifier is required");
            }

            const baseName = this.buildPackageBaseName(identifier, version);
            const cachedFilePath = await this.findExistingPackage(baseName);

            if (cachedFilePath) {
                const pluginDirFromCache = await this.extractPluginPackage(
                    cachedFilePath,
                    identifier,
                    type,
                );

                return {
                    identifier,
                    version,
                    pluginDir: pluginDirFromCache,
                    packagePath: cachedFilePath,
                };
            }

            const response = await this.httpClient.get(url, {
                responseType: "arraybuffer",
            });

            const axiosResponse = response as unknown as {
                data: Buffer;
                headers: Record<string, string | undefined>;
            };

            let fileName = this.extractFileNameFromUrl(url);
            const contentDisposition = axiosResponse.headers?.["content-disposition"];
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(
                    /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
                );
                if (fileNameMatch && fileNameMatch[1]) {
                    fileName = fileNameMatch[1].replace(/['"]/g, "");
                }
            }

            if (!fileName) {
                fileName = `${uuidv4()}.zip`;
            }

            const extension = this.extractFileExtension(fileName);
            const finalFileName = `${baseName}${extension}`;
            const filePath = path.join(this.tempDir, finalFileName);

            await fs.writeFile(filePath, axiosResponse.data);

            const pluginDir = await this.extractPluginPackage(filePath, identifier, type);

            return {
                identifier,
                version,
                pluginDir,
                packagePath: filePath,
            };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw HttpErrorFactory.badRequest(`Download extension failed: ${reason}`);
        }
    }

    /**
     * 从URL中提取文件名
     *
     * @param url 下载链接
     * @returns 文件名
     */
    private extractFileNameFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const segments = pathname.split("/");
            const lastSegment = segments[segments.length - 1];
            return lastSegment || `${uuidv4()}.zip`;
        } catch {
            return `${uuidv4()}.zip`;
        }
    }

    /**
     * 构建扩展包的基础文件名(不包含扩展名)
     *
     * @param identifier 扩展标识符
     * @param version 扩展版本号
     * @returns 基础文件名
     */
    private buildPackageBaseName(identifier: string, version?: string): string {
        const safeIdentifier = this.toSafeName(identifier);
        const safeVersion = version ? this.toSafeName(version) : undefined;
        return safeVersion ? `${safeIdentifier}-${safeVersion}` : safeIdentifier;
    }

    /**
     * 判断是否已有缓存的扩展包文件
     *
     * @param baseName 扩展包基础文件名
     * @returns 已存在的扩展包文件路径
     */
    private async findExistingPackage(baseName: string): Promise<string | null> {
        const files = await fs.readdir(this.tempDir);
        const matched = files.find((file) => file.startsWith(baseName));
        return matched ? path.join(this.tempDir, matched) : null;
    }

    /**
     * 从文件名中提取扩展名
     *
     * @param fileName 文件名
     * @returns 文件扩展名
     */
    private extractFileExtension(fileName: string): string {
        const extension = path.extname(fileName);
        return extension ? extension : ".zip";
    }

    /**
     * 将标识符或版本号转换为安全的文件名片段
     *
     * @param value 原始值
     * @returns 安全的文件名片段
     */
    private toSafeName(value: string): string {
        return value.replace(/[^a-zA-Z0-9._-]/g, "-");
    }

    /**
     * 解压插件包到插件目录
     *
     * @param packagePath 插件包路径
     * @param identifier 插件标识符
     * @param type 下载类型(安装/升级)
     * @returns 插件安装目录
     */
    private async extractPluginPackage(
        packagePath: string,
        identifier: string,
        type: ExtensionDownloadType,
    ): Promise<string> {
        const zip = new AdmZip(packagePath);
        const tempExtractDir = path.join(
            this.tempDir,
            `${path.basename(packagePath, path.extname(packagePath))}-${uuidv4()}`,
        );

        await fs.ensureDir(tempExtractDir);

        try {
            zip.extractAllTo(tempExtractDir, true);

            const sourceDir = await this.resolvePluginRoot(tempExtractDir);
            const targetDir = path.join(this.extensionsDir, this.toSafeName(identifier));

            // Handle upgrade: preserve data, storage, node_modules
            if (type === ExtensionDownload.UPGRADE && (await fs.pathExists(targetDir))) {
                await this.upgradeExtension(sourceDir, targetDir);
            } else {
                // Fresh install: remove old directory if exists
                if (await fs.pathExists(targetDir)) {
                    await fs.remove(targetDir);
                }

                await fs.ensureDir(targetDir);
                await fs.copy(sourceDir, targetDir);
            }

            await this.ensurePluginStructure(targetDir);

            return targetDir;
        } finally {
            await fs.remove(tempExtractDir).catch(() => undefined);
        }
    }

    /**
     * Upgrade extension by preserving data, storage, and node_modules
     * @param sourceDir New extension source directory
     * @param targetDir Existing extension directory
     */
    private async upgradeExtension(sourceDir: string, targetDir: string): Promise<void> {
        const preserveDirs = ["data", "storage", "node_modules"];
        const tempBackupDir = path.join(this.tempDir, `backup-${uuidv4()}`);

        try {
            // 1. Backup preserved directories
            await fs.ensureDir(tempBackupDir);
            for (const dir of preserveDirs) {
                const sourcePath = path.join(targetDir, dir);
                if (await fs.pathExists(sourcePath)) {
                    const backupPath = path.join(tempBackupDir, dir);
                    await fs.copy(sourcePath, backupPath);
                    this.logger.log(`Backed up ${dir} directory`);
                }
            }

            // 2. Remove old extension directory
            await fs.remove(targetDir);
            this.logger.log(`Removed old extension directory: ${targetDir}`);

            // 3. Copy new extension files
            await fs.ensureDir(targetDir);
            await fs.copy(sourceDir, targetDir);
            this.logger.log(`Copied new extension files to: ${targetDir}`);

            // 4. Restore preserved directories (don't overwrite if exists in new version)
            for (const dir of preserveDirs) {
                const backupPath = path.join(tempBackupDir, dir);
                const targetPath = path.join(targetDir, dir);

                if (await fs.pathExists(backupPath)) {
                    if (!(await fs.pathExists(targetPath))) {
                        // Directory doesn't exist in new version, restore it
                        await fs.copy(backupPath, targetPath);
                        this.logger.log(`Restored ${dir} directory`);
                    } else {
                        // Directory exists in new version, keep the new one
                        this.logger.log(
                            `Skipped restoring ${dir} (exists in new version, keeping new)`,
                        );
                    }
                }
            }
        } finally {
            // Clean up backup
            await fs.remove(tempBackupDir).catch(() => undefined);
        }
    }

    /**
     * 确保插件目录结构有效
     *
     * @param targetDir 插件目录
     */
    private async ensurePluginStructure(targetDir: string): Promise<void> {
        const buildDir = path.join(targetDir, "build");
        const outputPublicDir = path.join(targetDir, ".output", "public");

        // Check if build directory exists (backend)
        if (!(await fs.pathExists(buildDir))) {
            throw HttpErrorFactory.badRequest(
                'Invalid plugin package structure: missing "build" directory',
            );
        }

        // Check if .output/public directory exists (frontend)
        if (!(await fs.pathExists(outputPublicDir))) {
            throw HttpErrorFactory.badRequest(
                'Invalid plugin package structure: missing ".output/public" directory',
            );
        }
    }

    /**
     * 解析插件包内的根目录
     *
     * @param extractedDir 解压后的临时目录
     * @returns 插件根目录
     */
    private async resolvePluginRoot(extractedDir: string): Promise<string> {
        if (await this.hasPluginStructure(extractedDir)) {
            return extractedDir;
        }

        const entries = await fs.readdir(extractedDir);
        for (const entry of entries) {
            const entryPath = path.join(extractedDir, entry);
            const stat = await fs.stat(entryPath);
            if (stat.isDirectory() && (await this.hasPluginStructure(entryPath))) {
                return entryPath;
            }
        }

        throw HttpErrorFactory.badRequest(
            "Invalid plugin package structure: expected build and .output/public directories",
        );
    }

    /**
     * 判断目录是否包含有效插件结构
     *
     * @param dir 检测目录
     * @returns 是否包含 build 和 .output/public 目录
     */
    private async hasPluginStructure(dir: string): Promise<boolean> {
        const buildDir = path.join(dir, "build");
        const outputPublicDir = path.join(dir, ".output", "public");

        return (await fs.pathExists(buildDir)) && (await fs.pathExists(outputPublicDir));
    }

    /**
     * Install extension with complete workflow
     * @param identifier Extension identifier
     * @param requestedVersion Optional version, uses latest if not provided
     * @param extensionMarketService Market service instance for fetching extension data
     * @returns Installed extension entity
     */
    async install(
        identifier: string,
        requestedVersion: string | undefined,
        extensionMarketService: ExtensionMarketService,
    ) {
        this.logger.log(`Starting install extension: ${identifier}`);

        try {
            const extensionInfo = await extensionMarketService.getApplicationDetail(identifier);
            const targetVersion =
                requestedVersion ??
                (await this.resolveLatestVersion(identifier, extensionMarketService));

            if (!targetVersion) {
                throw HttpErrorFactory.badRequest(
                    `No available version found for extension: ${identifier}`,
                );
            }

            const { url } = await extensionMarketService.downloadApplication(
                identifier,
                targetVersion,
                ExtensionDownload.INSTALL,
            );
            await this.download(url, identifier, ExtensionDownload.INSTALL, targetVersion);

            const extension = await this.extensionsService.create({
                name: extensionInfo.name,
                identifier: extensionInfo.identifier,
                version: targetVersion,
                description: extensionInfo.description,
                icon: extensionInfo.icon,
                type: extensionInfo.type as ExtensionTypeType,
                supportTerminal: extensionInfo.supportTerminal as ExtensionSupportTerminalType[],
                author: extensionInfo.author,
                documentation: extensionInfo.content,
                status: ExtensionStatus.ENABLED,
                isLocal: false,
            });

            // Update extensions.json to enable the new extension
            await this.updateExtensionsConfigWrapper(extensionInfo, targetVersion);

            // Copy web assets to public directory
            await this.copyWebAssets(identifier);

            // Install dependencies before restarting
            await this.installDependencies();

            // Synchronize extension tables and execute seeds BEFORE restart
            await this.synchronizeExtensionTablesAndSeeds(identifier);

            // Schedule PM2 restart after response is sent
            this.scheduleRestart();

            this.logger.log(`Extension installed successfully: ${identifier}@${targetVersion}`);
            return extension;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to install extension: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Upgrade extension to latest version
     * @param identifier Extension identifier
     * @param extensionMarketService Market service instance
     * @returns Updated extension entity
     */
    async upgrade(identifier: string, extensionMarketService: ExtensionMarketService) {
        this.logger.log(`Starting upgrade extension: ${identifier}`);

        try {
            // 1. Get extension info and latest version
            const extensionInfo = await extensionMarketService.getApplicationDetail(identifier);
            const latestVersion = await this.resolveLatestVersion(
                identifier,
                extensionMarketService,
            );

            if (!latestVersion) {
                throw HttpErrorFactory.badRequest(
                    `No available version found for extension: ${identifier}`,
                );
            }

            // 2. Download latest version with UPGRADE type
            const { url } = await extensionMarketService.downloadApplication(
                identifier,
                latestVersion,
                ExtensionDownload.UPGRADE,
            );
            await this.download(url, identifier, ExtensionDownload.UPGRADE, latestVersion);

            // 3. Update extension in database
            const extension = await this.extensionsService.findByIdentifier(identifier);
            if (!extension) {
                throw HttpErrorFactory.notFound(`Extension ${identifier} not found`);
            }

            const updatedExtension = await this.extensionsService.updateById(extension.id, {
                version: latestVersion,
                name: extensionInfo.name,
                description: extensionInfo.description,
                icon: extensionInfo.icon,
                type: extensionInfo.type as ExtensionTypeType,
                supportTerminal: extensionInfo.supportTerminal as ExtensionSupportTerminalType[],
                author: extensionInfo.author,
                documentation: extensionInfo.content,
            });

            // 4. Update extensions.json
            await this.updateExtensionsConfigWrapper(extensionInfo, latestVersion);

            // 5. Copy web assets to public directory
            await this.copyWebAssets(identifier);

            // 6. Install dependencies
            await this.installDependencies();

            // 7. Synchronize extension tables and execute seeds BEFORE restart
            await this.synchronizeExtensionTablesAndSeeds(identifier);

            // 8. Schedule PM2 restart after response is sent
            this.scheduleRestart();

            this.logger.log(`Extension upgraded successfully: ${identifier} to ${latestVersion}`);
            return updatedExtension;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to upgrade extension: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Resolve latest available version for extension
     * @param identifier Extension identifier
     * @param extensionMarketService Market service instance
     * @returns Latest version string or null if none available
     */
    private async resolveLatestVersion(
        identifier: string,
        extensionMarketService: ExtensionMarketService,
    ): Promise<string | null> {
        const versionsRaw = await extensionMarketService.getApplicationVersions(identifier);
        if (!versionsRaw || versionsRaw.length === 0) {
            return null;
        }

        // 1. Filter valid semver versions
        const validVersions = versionsRaw.map((v) => v.version).filter((v) => semver.valid(v));

        if (validVersions.length === 0) {
            // Fallback to raw first item if no valid semver found
            return versionsRaw[0].version;
        }

        // 2. Sort descending using semver
        validVersions.sort((a, b) => semver.rcompare(a, b));

        // 3. Prefer stable release (no prerelease tag)
        const latestStable = validVersions.find((v) => !semver.prerelease(v));

        // 4. Return latest stable or latest prerelease
        return latestStable || validVersions[0];
    }

    /**
     * Update extensions.json configuration file using ExtensionConfigService
     * @param extensionInfo Extension detail information
     * @param version Extension version
     * @private
     */
    private async updateExtensionsConfigWrapper(
        extensionInfo: ExtensionDetailType,
        version: string,
    ): Promise<void> {
        try {
            const extensionConfig = {
                manifest: {
                    identifier: extensionInfo.identifier,
                    name: extensionInfo.name,
                    version: version,
                    description: extensionInfo.description,
                    author: extensionInfo.author,
                },
                isLocal: false,
                enabled: true,
                installedAt: new Date().toISOString(),
            };

            await this.extensionConfigService.addExtension(
                extensionInfo.identifier,
                extensionConfig,
                "applications",
            );

            this.logger.log(
                `Updated extensions.json: enabled ${extensionInfo.identifier}@${version}`,
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Failed to update extensions.json: ${errorMessage}. Extension installed but may not load on restart.`,
            );
            // Don't throw error - extension is already installed in database
        }
    }

    /**
     * Drop extension database schema using ExtensionSchemaService
     * @param identifier Extension identifier
     * @private
     */
    private async dropExtensionSchemaWrapper(identifier: string): Promise<void> {
        try {
            // Use the same schema name sanitization logic as creation
            const schemaName = getExtensionSchemaName(identifier);

            this.logger.log(`Checking for extension schema: ${schemaName}`);

            // Check if schema exists
            const schemaExists = await this.extensionSchemaService.checkSchemaExists(schemaName);

            if (schemaExists) {
                this.logger.log(`Dropping extension schema: ${schemaName}`);
                await this.extensionSchemaService.dropSchema(schemaName);
                this.logger.log(`Extension schema dropped successfully: ${schemaName}`);
            } else {
                this.logger.log(`Extension schema does not exist: ${schemaName}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Failed to drop extension schema: ${errorMessage}. Manual cleanup may be required.`,
            );
            // Don't throw error - continue with uninstall
        }
    }

    /**
     * Delete file records associated with extension
     * @param identifier Extension identifier
     * @private
     */
    private async deleteExtensionFiles(identifier: string): Promise<void> {
        try {
            this.logger.log(`Deleting file records for extension: ${identifier}`);

            const files = await this.fileUploadService.findAll({
                where: { extensionIdentifier: identifier },
            });

            if (files.length === 0) {
                this.logger.log(`No file records found for extension: ${identifier}`);
                return;
            }

            // Batch delete database records (physical files will be removed with extension directory)
            const fileIds = files.map((file) => file.id);
            const deletedCount = await this.fileUploadService.deleteMany(fileIds);

            this.logger.log(`Deleted ${deletedCount} file record(s) for extension: ${identifier}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Failed to delete file records: ${errorMessage}. Manual cleanup may be required.`,
            );
            // Don't throw error - continue with uninstall
        }
    }

    /**
     * Install project dependencies using pnpm
     * @private
     */
    private async installDependencies(): Promise<void> {
        try {
            this.logger.log("Installing project dependencies...");

            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);

            const projectRoot = path.join(process.cwd(), "..", "..");

            await execAsync("pnpm install --no-frozen-lockfile", {
                cwd: projectRoot,
                env: process.env,
            });

            this.logger.log("Dependencies installed successfully");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to install dependencies: ${errorMessage}`);
            throw HttpErrorFactory.internal(`Failed to install dependencies: ${errorMessage}`);
        }
    }

    /**
     * Build extension using pnpm
     * @param extensionDir Extension directory path
     * @private
     */
    private async buildExtension(extensionDir: string): Promise<void> {
        try {
            this.logger.log(`Building extension at: ${extensionDir}`);

            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);

            // Build web first, then build api
            await execAsync("pnpm build:publish", {
                cwd: extensionDir,
                env: process.env,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to build extension: ${errorMessage}`);
            throw HttpErrorFactory.internal(`Failed to build extension: ${errorMessage}`);
        }
    }

    /**
     * Restart PM2 process to load new extensions
     * Uses restart instead of reload to ensure module cache is cleared
     * @private
     */
    private async restartPm2Process(): Promise<void> {
        try {
            this.logger.log("Restarting PM2 process to load new extension");

            if (!this.pm2Service.isPm2Available()) {
                this.logger.warn(
                    "PM2 is not available. Extension installed but requires manual restart to take effect.",
                );
                return;
            }

            const result = await this.pm2Service.restart();

            if (result.success) {
                this.logger.log("PM2 process restarted successfully");
            } else {
                this.logger.warn(
                    `Failed to restart PM2 process: ${result.message}. Extension installed but requires manual restart.`,
                );
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Error during PM2 restart: ${errorMessage}. Extension installed but requires manual restart.`,
            );
            // Don't throw error - extension is already installed
        }
    }

    /**
     * Create extension from template
     * @param dto Create extension DTO
     * @returns Created extension entity
     */
    async createFromTemplate(dto: CreateExtensionDto) {
        this.logger.log(`Starting create extension from template: ${dto.identifier}`);

        try {
            // 1. Check if extension already exists
            const existingExtension = await this.extensionsService.findByIdentifier(dto.identifier);
            if (existingExtension) {
                throw HttpErrorFactory.badRequest(
                    `Extension with identifier ${dto.identifier} already exists`,
                );
            }

            // 2. Extract template to extensions directory
            const extensionDir = await this.extractTemplateToExtensions(dto.identifier);

            // 3. Update manifest.json and package.json
            await this.updateExtensionFiles(extensionDir, dto);

            // 4. Create extension in database
            const extension = await this.extensionsService.create({
                name: dto.name,
                identifier: dto.identifier,
                version: dto.version || "0.0.1",
                description: dto.description,
                icon: dto.icon,
                type: dto.type,
                supportTerminal: dto.supportTerminal,
                author: dto.author,
                homepage: dto.homepage,
                documentation: dto.documentation,
                status: ExtensionStatus.ENABLED,
                isLocal: true,
            });

            // 5. Add extension to extensions.json
            await this.addExtensionToConfig(dto);

            // 6. Install dependencies
            await this.installDependencies();

            // 7. Build extension
            await this.buildExtension(extensionDir);

            // 8. Copy web assets to public directory
            await this.copyWebAssets(dto.identifier);

            // 9. Synchronize extension tables and execute seeds BEFORE restart
            await this.synchronizeExtensionTablesAndSeeds(dto.identifier);

            // 10. Schedule PM2 restart after response is sent
            this.scheduleRestart();

            this.logger.log(`Extension created successfully: ${dto.identifier}`);
            return extension;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to create extension from template: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Extract template zip to extensions directory
     * @param identifier Extension identifier
     * @returns Extension directory path
     * @private
     */
    private async extractTemplateToExtensions(identifier: string): Promise<string> {
        const templatePath = path.join(this.templatesDir, "buildingai-extension-starter.zip");

        if (!(await fs.pathExists(templatePath))) {
            throw HttpErrorFactory.badRequest(`Template file not found: ${templatePath}`);
        }

        const safeIdentifier = this.toSafeName(identifier);
        const targetDir = path.join(this.extensionsDir, safeIdentifier);

        // Check if target directory already exists
        if (await fs.pathExists(targetDir)) {
            throw HttpErrorFactory.badRequest(`Extension directory already exists: ${targetDir}`);
        }

        try {
            // Extract template
            const zip = new AdmZip(templatePath);
            const tempExtractDir = path.join(this.tempDir, `template-${uuidv4()}`);

            await fs.ensureDir(tempExtractDir);

            try {
                zip.extractAllTo(tempExtractDir, true);

                // Find the root directory (may be nested)
                const sourceDir = await this.resolveTemplateRoot(tempExtractDir);

                // Copy to target directory
                await fs.ensureDir(targetDir);
                await fs.copy(sourceDir, targetDir);

                this.logger.log(`Template extracted to: ${targetDir}`);
                return targetDir;
            } finally {
                // Clean up temp directory
                await fs.remove(tempExtractDir).catch(() => undefined);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw HttpErrorFactory.badRequest(`Failed to extract template: ${errorMessage}`);
        }
    }

    /**
     * Resolve template root directory
     * @param extractedDir Extracted temporary directory
     * @returns Template root directory path
     * @private
     */
    private async resolveTemplateRoot(extractedDir: string): Promise<string> {
        // Check if current directory has package.json
        const packageJsonPath = path.join(extractedDir, "package.json");
        if (await fs.pathExists(packageJsonPath)) {
            return extractedDir;
        }

        // Check subdirectories
        const entries = await fs.readdir(extractedDir);
        for (const entry of entries) {
            const entryPath = path.join(extractedDir, entry);
            const stat = await fs.stat(entryPath);
            if (stat.isDirectory()) {
                const subPackageJsonPath = path.join(entryPath, "package.json");
                if (await fs.pathExists(subPackageJsonPath)) {
                    return entryPath;
                }
            }
        }

        throw HttpErrorFactory.badRequest("Invalid template structure: package.json not found");
    }

    /**
     * Update extension manifest.json and package.json files
     * @param extensionDir Extension directory path
     * @param dto Create extension DTO
     * @private
     */
    private async updateExtensionFiles(
        extensionDir: string,
        dto: CreateExtensionDto,
    ): Promise<void> {
        // Update manifest.json
        const manifestPath = path.join(extensionDir, "manifest.json");
        if (await fs.pathExists(manifestPath)) {
            const manifest = await fs.readJson(manifestPath);
            manifest.identifier = dto.identifier;
            manifest.name = dto.name;
            manifest.version = dto.version || "0.0.1";
            manifest.description = dto.description || "";
            manifest.homepage = dto.homepage || "";
            if (dto.type) {
                manifest.type = dto.type;
            }
            if (dto.author) {
                manifest.author = {
                    avatar: dto.author.avatar || "",
                    name: dto.author.name || "",
                    homepage: dto.author.homepage || "",
                };
            }
            await fs.writeJson(manifestPath, manifest, { spaces: 4 });
            this.logger.log(`Updated manifest.json for ${dto.identifier}`);
        }

        // Update package.json
        const packageJsonPath = path.join(extensionDir, "package.json");
        if (await fs.pathExists(packageJsonPath)) {
            const packageJson = await fs.readJson(packageJsonPath);
            packageJson.name = dto.identifier;
            packageJson.version = dto.version || "0.0.1";
            packageJson.description = dto.description || "";
            if (dto.author?.name) {
                packageJson.author = dto.author.name;
            }
            await fs.writeJson(packageJsonPath, packageJson, { spaces: 4 });
            this.logger.log(`Updated package.json for ${dto.identifier}`);
        }
    }

    /**
     * Update author name in manifest.json and package.json
     * @param identifier Extension identifier
     * @param authorName Author name to update
     */
    async updateAuthorName(identifier: string, authorName: string): Promise<void> {
        if (!authorName) return;

        const safeIdentifier = this.toSafeName(identifier);
        const extensionDir = path.join(this.extensionsDir, safeIdentifier);

        if (!(await fs.pathExists(extensionDir))) {
            this.logger.warn(`Extension directory not found: ${extensionDir}`);
            return;
        }

        // Update manifest.json
        const manifestPath = path.join(extensionDir, "manifest.json");
        if (await fs.pathExists(manifestPath)) {
            const manifest = await fs.readJson(manifestPath);
            if (manifest.author) {
                manifest.author.name = authorName;
                await fs.writeJson(manifestPath, manifest, { spaces: 4 });
            }
        }

        // Update package.json
        const packageJsonPath = path.join(extensionDir, "package.json");
        if (await fs.pathExists(packageJsonPath)) {
            const packageJson = await fs.readJson(packageJsonPath);
            packageJson.author = authorName;
            await fs.writeJson(packageJsonPath, packageJson, { spaces: 4 });
        }
    }

    /**
     * Add extension to extensions.json configuration
     * @param dto Create extension DTO
     * @private
     */
    private async addExtensionToConfig(dto: CreateExtensionDto): Promise<void> {
        const extensionConfig = {
            manifest: {
                identifier: dto.identifier,
                name: dto.name,
                version: dto.version || "0.0.1",
                description: dto.description || "",
                author: {
                    avatar: dto.author?.avatar || "",
                    name: dto.author?.name || "",
                    homepage: dto.author?.homepage || "",
                },
            },
            isLocal: true,
            enabled: true,
            installedAt: new Date().toISOString(),
        };

        await this.extensionConfigService.addExtension(
            dto.identifier,
            extensionConfig,
            "applications",
        );

        this.logger.log(`Added extension to extensions.json: ${dto.identifier}`);
    }

    /**
     * Copy web assets from extension .output/public to public/web/extensions/{identifier}
     * @param identifier Extension identifier
     * @private
     */
    private async copyWebAssets(identifier: string): Promise<void> {
        try {
            const safeIdentifier = this.toSafeName(identifier);
            const extensionDir = path.join(this.extensionsDir, safeIdentifier);
            const sourceWebDir = path.join(extensionDir, ".output", "public");
            const targetWebDir = path.join(this.publicWebDir, safeIdentifier);

            // Check if source web directory exists
            if (!(await fs.pathExists(sourceWebDir))) {
                this.logger.warn(
                    `Source web directory not found: ${sourceWebDir}. Skipping web assets copy.`,
                );
                return;
            }

            // Remove existing target directory if it exists
            if (await fs.pathExists(targetWebDir)) {
                this.logger.log(`Removing existing web assets: ${targetWebDir}`);
                await fs.remove(targetWebDir);
            }

            // Copy web assets to public directory
            this.logger.log(`Copying web assets from ${sourceWebDir} to ${targetWebDir}`);
            await fs.copy(sourceWebDir, targetWebDir);
            this.logger.log(`Web assets copied successfully for extension: ${identifier}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to copy web assets: ${errorMessage}`);
            throw HttpErrorFactory.internal(`Failed to copy web assets: ${errorMessage}`);
        }
    }

    /**
     * Remove web assets from public/web/extensions/{identifier}
     * @param identifier Extension identifier
     * @private
     */
    private async removeWebAssets(identifier: string): Promise<void> {
        try {
            const safeIdentifier = this.toSafeName(identifier);
            const targetWebDir = path.join(this.publicWebDir, safeIdentifier);

            // Check if target web directory exists
            if (await fs.pathExists(targetWebDir)) {
                this.logger.log(`Removing web assets: ${targetWebDir}`);
                await fs.remove(targetWebDir);
                this.logger.log(`Web assets removed successfully for extension: ${identifier}`);
            } else {
                this.logger.log(
                    `Web assets directory not found: ${targetWebDir}. Skipping removal.`,
                );
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to remove web assets: ${errorMessage}`);
            // Don't throw error - continue with uninstall even if web assets removal fails
        }
    }

    /**
     * Synchronize extension database tables and execute seeds before restart
     *
     * This method creates a temporary database connection to:
     * 1. Load extension entities
     * 2. Synchronize extension tables (create/update schema)
     * 3. Execute extension seed files
     *
     * @param identifier Extension identifier
     * @private
     */
    private async synchronizeExtensionTablesAndSeeds(identifier: string): Promise<void> {
        let tempDataSource: DataSource | null = null;

        try {
            this.logger.log(
                `Synchronizing tables and executing seeds for extension: ${identifier}`,
            );

            // First, ensure the extension schema exists
            const schemaName = getExtensionSchemaName(identifier);
            await this.ensureExtensionSchema(schemaName);

            const safeIdentifier = this.toSafeName(identifier);
            const extensionPath = path.join(this.extensionsDir, safeIdentifier);
            const extensionEntitiesPath = path.join(
                extensionPath,
                "build",
                "db",
                "entities",
                "**",
                "*.entity.js",
            );

            // Get main app entities path (needed for relations like User, etc.)
            const dbPackagePath = require.resolve("@buildingai/db");
            const dbDistPath = path.dirname(dbPackagePath);
            const mainEntitiesPath = path.join(dbDistPath, "entities", "**", "*.entity.js");

            this.logger.log(`Loading entities from: ${extensionEntitiesPath}`);
            this.logger.log(`Loading main entities from: ${mainEntitiesPath}`);

            // Create temporary data source with both main app and extension entities
            const databaseOptions = createDataSourceConfig();
            tempDataSource = new DataSource({
                ...databaseOptions,
                entities: [mainEntitiesPath, extensionEntitiesPath],
                synchronize: true, // Enable synchronize for this temporary connection
                logging: false,
            });

            // Initialize and synchronize
            await tempDataSource.initialize();
            this.logger.log(`Extension ${identifier} tables synchronized successfully`);

            // Execute extension seeds
            await this.executeExtensionSeeds(identifier, tempDataSource);

            // Mark extension as installed
            await this.markExtensionAsInstalled(identifier);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to synchronize extension tables and seeds: ${errorMessage}`);
            throw error;
        } finally {
            // Close temporary connection
            if (tempDataSource?.isInitialized) {
                await tempDataSource.destroy();
            }
        }
    }

    /**
     * Execute extension seed files
     *
     * @param identifier Extension identifier
     * @param dataSource DataSource to use for seed execution
     * @private
     */
    private async executeExtensionSeeds(identifier: string, dataSource: DataSource): Promise<void> {
        const safeIdentifier = this.toSafeName(identifier);
        const extensionPath = path.join(this.extensionsDir, safeIdentifier);
        const seedsIndexPath = path.join(extensionPath, "build", "db", "seeds", "index.js");

        // Check if seeds entry exists
        if (!(await fs.pathExists(seedsIndexPath))) {
            this.logger.log(`Extension ${identifier} has no seeds, skipping...`);
            return;
        }

        try {
            this.logger.log(`Executing seeds for extension: ${identifier}`);

            // Dynamic require for CommonJS modules
            const seedsModule = require(seedsIndexPath);

            if (!seedsModule.getSeeders) {
                this.logger.warn(
                    `Extension ${identifier} seeds/index.ts must export getSeeders function`,
                );
                return;
            }

            // Get seeders and run
            const seeders: BaseSeeder[] = await seedsModule.getSeeders();

            if (!Array.isArray(seeders) || seeders.length === 0) {
                this.logger.log(`Extension ${identifier} has no seeders to run`);
                return;
            }

            const seedRunner = new SeedRunner(dataSource);
            await seedRunner.run(seeders);

            this.logger.log(`Extension ${identifier} seeds executed successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to execute extension ${identifier} seeds: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Ensure extension schema exists in database
     *
     * @param schemaName Schema name to create
     * @private
     */
    private async ensureExtensionSchema(schemaName: string): Promise<void> {
        try {
            // Check if schema already exists
            const result = await this.dataSource.query(
                `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
                [schemaName],
            );

            if (result.length > 0) {
                this.logger.log(`Schema "${schemaName}" already exists`);
                return;
            }

            // Create schema
            await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
            this.logger.log(`Created schema: ${schemaName}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to create schema "${schemaName}": ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Mark extension as installed by creating .installed file
     *
     * @param identifier Extension identifier
     * @private
     */
    private async markExtensionAsInstalled(identifier: string): Promise<void> {
        try {
            const safeIdentifier = this.toSafeName(identifier);
            const extensionPath = path.join(this.extensionsDir, safeIdentifier);
            const dataDir = path.join(extensionPath, "data");
            await fs.ensureDir(dataDir);

            const installFilePath = path.join(dataDir, ".installed");
            await fs.writeFile(
                installFilePath,
                JSON.stringify(
                    {
                        installed_at: new Date().toISOString(),
                        identifier: identifier,
                    },
                    null,
                    2,
                ),
            );

            this.logger.log(`Extension ${identifier} marked as installed`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Failed to mark extension ${identifier} as installed: ${errorMessage}`,
            );
            // Don't throw - this is not critical
        }
    }

    /**
     * Schedule PM2 restart after response is sent
     * Uses debouncing to prevent multiple concurrent restart requests
     * @private
     */
    private scheduleRestart(): void {
        // Check if restart is already scheduled
        if (ExtensionOperationService.restartScheduled) {
            this.logger.log("PM2 restart already scheduled, extending debounce timer...");

            // Clear existing timer and reschedule
            if (ExtensionOperationService.restartTimer) {
                clearTimeout(ExtensionOperationService.restartTimer);
            }
        } else {
            this.logger.log("Scheduling PM2 restart after response is sent...");
            ExtensionOperationService.restartScheduled = true;
        }

        // Schedule restart with debounce
        ExtensionOperationService.restartTimer = setTimeout(async () => {
            try {
                this.logger.log("Executing scheduled PM2 restart...");
                await this.restartPm2Process();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`Failed to restart PM2 after scheduling: ${errorMessage}`);
            } finally {
                // Reset state after restart attempt
                ExtensionOperationService.restartScheduled = false;
                ExtensionOperationService.restartTimer = null;
            }
        }, ExtensionOperationService.RESTART_DEBOUNCE_MS);
    }
}
