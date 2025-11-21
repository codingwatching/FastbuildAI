import { AppConfig } from "@buildingai/config/app.config";
import { getCachedExtensionList } from "@buildingai/core/modules";
import { TerminalLogger } from "@buildingai/logger";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { networkInterfaces } from "os";
import * as path from "path";

/**
 * 启动日志
 */
export const startLog = (currentPort?: number, startTime?: number) => {
    const port = currentPort ?? process.env.SERVER_PORT ?? 4090;
    const env = process.env.NODE_ENV;
    const nets = networkInterfaces();
    const ipAddresses: string[] = [];

    for (const name of Object.keys(nets)) {
        for (const net of nets[name] ?? []) {
            const isIPv4 = net.family === "IPv4" || (net.family as unknown) === 4;
            if (isIPv4 && !net.internal) {
                ipAddresses.push(net.address);
            }
        }
    }

    TerminalLogger.log("App Name", AppConfig.name);
    TerminalLogger.log("App Version", `v${AppConfig.version}`);
    TerminalLogger.log("Env", env ?? "unknown");
    TerminalLogger.log("Node Version", process.version);

    const pm2Instances = process.env.PM2_INSTANCES || "1";
    if (parseInt(pm2Instances) > 1) {
        TerminalLogger.log("PM2 Instances", pm2Instances, { color: "magenta" });
    }

    TerminalLogger.log("Local", `http://localhost:${port}`, { color: "cyan" });

    if (ipAddresses.length > 0) {
        ipAddresses.forEach((ip) => {
            TerminalLogger.log("Network", `http://${ip}:${port}`, {
                color: "cyan",
            });
        });
    }

    const duration = startTime ? Date.now() - startTime : 0;

    if (duration < 1000) {
        TerminalLogger.success("Startup Time", `${duration} ms`);
    } else if (duration < 5000) {
        TerminalLogger.info("Startup Time", `${duration} ms`);
    } else if (duration < 10000) {
        TerminalLogger.warn("Startup Time", `${duration} ms`);
    } else {
        TerminalLogger.error("Startup Time", `${duration} ms`, { icon: "⚠️" });
    }
};

/**
 * 尝试监听端口，如果被占用则尝试其他端口（仅在开发环境下）
 * @param app NestJS应用实例
 * @param initialPort 初始端口号
 * @param maxRetries 最大重试次数
 * @returns Promise<void>
 */
export const tryListen = async (
    app: INestApplication,
    initialPort: number,
    maxRetries = 10,
    startTime?: number,
): Promise<void> => {
    let currentPort = initialPort;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            await app.listen(currentPort);
            // 如果端口变更，记录到日志
            if (currentPort !== initialPort) {
                TerminalLogger.success(
                    "端口切换",
                    `端口 ${initialPort} 被占用，已切换到端口 ${currentPort}`,
                );
            }
            startLog(currentPort, startTime);
            return;
        } catch (error) {
            if (error.code === "EADDRINUSE" && process.env.NODE_ENV === "development") {
                retries++;
                currentPort = initialPort + retries;
                TerminalLogger.warn(
                    "端口占用",
                    `端口 ${initialPort + retries - 1} 被占用，尝试端口 ${currentPort}...`,
                );
            } else {
                // 非端口占用错误或非开发环境，直接抛出
                throw error;
            }
        }
    }

    throw new Error(`尝试了 ${maxRetries} 个端口后仍无法启动服务`);
};

/**
 * 设置静态资源目录
 * @param app NestExpressApplication实例
 */
export const setAssetsDir = async (app: NestExpressApplication) => {
    const enabledIdentifiers = getCachedExtensionList();
    const rootDir = path.join(process.cwd(), "..", "..");

    const extensionsAssets = enabledIdentifiers.map((item) => {
        return {
            dir: path.join(rootDir, "extensions", item.identifier, "storage", "static"),
            prefix: `/${item.identifier}/static`,
        };
    });

    const extensionsUploads = enabledIdentifiers.map((item) => {
        return {
            dir: path.join(rootDir, "extensions", item.identifier, "storage", "uploads"),
            prefix: `/${item.identifier}/uploads`,
        };
    });

    const dirs = [
        {
            dir: path.join(rootDir, "public", "web"),
            prefix: "/",
        },
        {
            dir: path.join(rootDir, "storage", "uploads"),
            prefix: "/uploads",
        },
        {
            dir: path.join(rootDir, "storage", "static"),
            prefix: "/static",
        },
        ...extensionsAssets,
        ...extensionsUploads,
    ];

    dirs.forEach((dir) => {
        app.useStaticAssets(dir.dir, {
            prefix: dir.prefix,
        });
    });
};
