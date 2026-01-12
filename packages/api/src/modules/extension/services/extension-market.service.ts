import { AppConfig } from "@buildingai/config";
import { ExtensionDownloadType, ExtensionStatus } from "@buildingai/constants";
import { DICT_GROUP_KEYS, DICT_KEYS } from "@buildingai/constants/server/dict-key.constant";
import {
    ApplicationListItem,
    getExtensionEnabledStatus,
    isExtensionCompatible,
} from "@buildingai/core/modules";
import { ExtensionDetailType, ExtensionsService, PlatformInfo } from "@buildingai/core/modules";
import { DictService } from "@buildingai/dict";
import { HttpErrorFactory } from "@buildingai/errors";
import { createHttpClient, createHttpErrorMessage, HttpClientInstance } from "@buildingai/utils";
import { SYSTEM_CONFIG } from "@common/constants";
import { Injectable, Logger } from "@nestjs/common";
import { machineId } from "node-machine-id";
import * as semver from "semver";

/**
 * Extension market service
 */
@Injectable()
export class ExtensionMarketService {
    private readonly logger = new Logger(ExtensionMarketService.name);
    private readonly httpClient: HttpClientInstance;
    private readonly appsMarketHttpClient: HttpClientInstance;
    private platformSecret: string | null = null;

    constructor(
        private readonly dictService: DictService,
        private readonly extensionsService: ExtensionsService,
    ) {
        const baseApiUrl = process.env.EXTENSION_API_URL || "https://cloud.buildingai.cc/api";

        this.httpClient = createHttpClient({
            baseURL: baseApiUrl + "/market",
            timeout: 20000,
            retryConfig: {
                retries: 3,
                retryDelay: 1000,
            },
            logConfig: {
                enableErrorLog: true,
            },
            headers: {
                Domain: process.env.APP_DOMAIN,
                "platform-version": AppConfig.version,
            },
        });

        // 创建 apps-market 专用的 httpClient
        this.appsMarketHttpClient = createHttpClient({
            baseURL: baseApiUrl + "/apps-market",
            timeout: 20000,
            retryConfig: {
                retries: 3,
                retryDelay: 1000,
            },
            logConfig: {
                enableErrorLog: true,
            },
            headers: {
                Domain: process.env.APP_DOMAIN,
                "platform-version": AppConfig.version,
            },
        });

        // 添加请求拦截器,动态获取平台密钥
        const addAuthInterceptor = (client: HttpClientInstance) => {
            client.interceptors.request.use(async (config) => {
                // 如果内存中没有，尝试从数据库加载一次
                if (!this.platformSecret) {
                    this.platformSecret = await this.dictService.get<string | null>(
                        DICT_KEYS.PLATFORM_SECRET,
                        null,
                        DICT_GROUP_KEYS.APPLICATION,
                    );
                }

                if (this.platformSecret) {
                    config.headers["X-API-Key"] = this.platformSecret;
                }

                return config;
            });
        };

        addAuthInterceptor(this.httpClient);
        addAuthInterceptor(this.appsMarketHttpClient);
    }

    isVersionInRange(version: string, range: string): boolean {
        if (!semver.valid(version)) return false;

        if (!semver.validRange(range)) return false;

        return semver.satisfies(version, range);
    }

    /**
     * Get platform info
     */
    async getPlatformInfo(platformSecret?: string): Promise<PlatformInfo | null> {
        const originalSecret = this.platformSecret;

        try {
            if (platformSecret) {
                this.platformSecret = platformSecret;
            }

            const response = await this.httpClient.get("/getPlatform");
            return response.data;
        } catch (error) {
            if (platformSecret) {
                this.platformSecret = originalSecret;
            }
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(`Failed to get platform info: ${errorMessage}`, error);
            return null;
        }
    }

    /**
     * Get application list
     */
    async getApplicationList(): Promise<ApplicationListItem[]> {
        try {
            const response = await this.httpClient.get("/lists");
            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(`Failed to get application list: ${errorMessage}`, error);
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Get application detail
     */
    async getApplicationDetail(identifier: string): Promise<ExtensionDetailType> {
        try {
            const response = await this.httpClient.get(`/detail/${identifier}`);
            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(
                `Failed to get application detail for ${identifier}: ${errorMessage}`,
                error,
            );
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Get application versions list
     */
    async getApplicationVersions(identifier: string): Promise<
        {
            version: string;
            explain: string;
            createdAt: string;
        }[]
    > {
        try {
            const response = await this.httpClient.get(`/versions/${identifier}`);
            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(
                `Failed to get application versions for ${identifier}: ${errorMessage}`,
                error,
            );
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Download application
     */
    async downloadApplication(
        identifier: string,
        version: string,
        type: ExtensionDownloadType,
    ): Promise<{
        version: string;
        explain: string;
        url: string;
    }> {
        try {
            const response = await this.httpClient.post(
                `/download/${identifier}/${version}/${type}`,
            );
            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(
                `Failed to download application ${identifier}@${version}: ${errorMessage}`,
                error,
            );
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Get application upgrade content
     */
    async getApplicationUpgradeContent(identifier: string, version: string) {
        try {
            const response = await this.httpClient.get(`/getVersionInfo/${identifier}/${version}`);
            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(
                `Failed to get application upgrade content for ${identifier}@${version}: ${errorMessage}`,
                error,
            );
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Uninstall application
     */
    async uninstallApplication(identifier: string, version: string) {
        try {
            const response = await this.httpClient.post(`/uninstall/${identifier}/${version}`);
            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(
                `Failed to uninstall application ${identifier}@${version}: ${errorMessage}`,
                error,
            );
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Get application by activation code
     */
    async getApplicationByActivationCode(activationCode: string) {
        try {
            const response = await this.appsMarketHttpClient.get(`/getApps/${activationCode}`);
            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(
                `Failed to get application by activation code ${activationCode}: ${errorMessage}`,
                error,
            );
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Get system key from dictionary or environment
     * @returns System key or null
     */
    private async getSystemKey(): Promise<string | null> {
        // Try to get from dictionary first (similar to platform secret)
        const systemKey = await this.dictService.get<string | null>(
            "machine_id",
            undefined,
            SYSTEM_CONFIG,
        );

        // Fallback to environment variable
        return systemKey ?? undefined;
    }

    /**
     * Install application by activation code
     * @param activationCode Activation code
     * @returns Installation response with extension info and download URL
     */
    async installApplicationByActivationCode(activationCode: string) {
        try {
            let systemKey = await this.getSystemKey();
            if (!systemKey) {
                // 生成新的机器 ID（使用默认的哈希值，确保唯一性）
                this.logger.log("🔄 正在生成系统机器 ID...");
                const generatedMachineId = await machineId();

                if (!generatedMachineId || generatedMachineId.trim() === "") {
                    throw HttpErrorFactory.badRequest("生成的机器 ID 为空");
                }

                // 存储机器 ID 到 config 表
                await this.dictService.set("machine_id", generatedMachineId, {
                    group: SYSTEM_CONFIG,
                    description: "系统机器唯一标识符（不可改变）",
                    isEnabled: true,
                });

                systemKey = generatedMachineId;
            }

            const response = await this.appsMarketHttpClient.post(
                `/install/${activationCode}`,
                {},
                {
                    headers: {
                        "system-key": systemKey,
                    },
                },
            );

            return response.data;
        } catch (error) {
            const errorMessage = createHttpErrorMessage(error);
            this.logger.error(
                `Failed to install application by activation code ${activationCode}: ${errorMessage}`,
                error,
            );
            throw HttpErrorFactory.badRequest(error.response?.data?.message);
        }
    }

    /**
     * Get extension list with market data if platform secret is configured
     * Handles both scenarios: with/without platform secret
     */
    async getMixedApplicationList() {
        const platformSecret = await this.dictService.get<string | null>(
            DICT_KEYS.PLATFORM_SECRET,
            null,
            DICT_GROUP_KEYS.APPLICATION,
        );

        const installedExtensions = await this.extensionsService.findAll();

        // Fetch market list only if platform secret is configured
        let extensionList: ApplicationListItem[] = [];
        if (platformSecret) {
            try {
                extensionList = await this.getApplicationList();
            } catch (error) {
                this.logger.error(`Failed to get application list: ${error}`);
                extensionList = [];
            }
        }

        const installedIdentifiers = new Set(installedExtensions.map((ext) => ext.identifier));

        // Create a map for quick lookup of market versions
        const marketVersionMap = new Map(
            extensionList.map((item) => [item.identifier, item.version]),
        );

        // Map uninstalled market extensions
        const marketExtensions = extensionList
            .filter((item) => !installedIdentifiers.has(item.identifier))
            .map((item) => ({
                id: item.id || null,
                name: item.name,
                identifier: item.identifier,
                version: item.version,
                description: item.description,
                isCompatible: item.isCompatible || null,
                icon: item.icon,
                type: item.type,
                supportTerminal: item.supportTerminal,
                isLocal: false,
                status: ExtensionStatus.DISABLED,
                author: item.author,
                homepage: "",
                documentation: "",
                config: null,
                isInstalled: false,
                createdAt: new Date(item.createdAt),
                updatedAt: new Date(item.updatedAt),
                purchasedAt: new Date(item.purchasedAt),
                latestVersion: item.version,
                hasUpdate: false,
            }));

        // Map installed extensions with update check and compatibility check
        const installedExtensionsList = await Promise.all(
            installedExtensions.map(async (ext) => {
                let hasUpdate = false;
                let latestVersion: string | null = null;

                // Only check updates for non-local extensions
                if (!ext.isLocal) {
                    const marketVersion = marketVersionMap.get(ext.identifier);
                    if (marketVersion) {
                        latestVersion = marketVersion;
                        // Use semver to compare versions
                        if (semver.valid(marketVersion) && semver.valid(ext.version)) {
                            hasUpdate = semver.gt(marketVersion, ext.version);
                        }
                    }
                }

                // Check version compatibility for installed extensions
                const isCompatible = await isExtensionCompatible(ext.identifier);

                // Get enabled status from extensions.json (true -> 1, false -> 0)
                const enabledStatus = await getExtensionEnabledStatus(ext.identifier);
                const status =
                    enabledStatus === null
                        ? ext.status
                        : enabledStatus
                          ? ExtensionStatus.ENABLED
                          : ExtensionStatus.DISABLED;

                return {
                    ...ext,
                    status,
                    isInstalled: true,
                    isCompatible,
                    latestVersion,
                    hasUpdate,
                };
            }),
        );

        const mergedList = installedExtensionsList.concat(marketExtensions);

        return mergedList;
    }
}
