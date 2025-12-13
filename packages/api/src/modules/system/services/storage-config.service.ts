import { Dict, StorageConfig } from "@buildingai/db/entities";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import type { EntityManager } from "typeorm/entity-manager/EntityManager";

import { UpdateStorageConfigDto } from "../dto/update-storage-config.dto";

@Injectable()
export class StorageConfigService {
    @InjectRepository(StorageConfig)
    private repository: Repository<StorageConfig>;

    @InjectRepository(Dict)
    private dictRepository: Repository<Dict>;

    constructor(private dataSource: DataSource) {}

    async getAllConfigs() {
        return await this.repository
            .createQueryBuilder("storage-config")
            .select([
                "storage-config.id",
                "storage-config.isActive",
                "storage-config.storageType",
                "storage-config.config",
            ])
            .orderBy("sort", "ASC")
            .getMany();
    }

    async updateConfig(id: string, dto: UpdateStorageConfigDto) {
        await this.dataSource.manager.transaction(async (manager) => {
            const activeStorage = await manager.findOne(StorageConfig, {
                where: { isActive: true },
            });

            // Deactivate the currently active storage
            if (activeStorage.id !== id && dto.isActive) {
                activeStorage.isActive = false;
                await manager.save(activeStorage);
            }

            const { storageType, ...updateValue } = dto;
            const res = await manager.update(StorageConfig, { id, storageType }, updateValue);
            if (res.affected === 0) {
                throw new Error("Update storage config failed");
            }

            if (dto.isActive) {
                // 获取完整的配置信息
                const newActiveConfig = await manager.findOne(StorageConfig, {
                    where: { id },
                });

                if (newActiveConfig) {
                    await this.syncToDict(manager, newActiveConfig);
                }
            }
        });
    }

    getActiveStorageConfig() {
        return this.repository.findOne({ where: { isActive: true } });
    }

    private async syncToDict(manager: EntityManager, config: StorageConfig): Promise<void> {
        const group = "storage_config";

        // 1. 同步存储引擎类型
        await this.upsertDict(manager, {
            key: "engine",
            value: config.storageType,
            group,
            description: "当前激活的存储引擎类型",
            isEnabled: true,
        });

        // 2. 同步域名配置
        if (config.config && typeof config.config === "object") {
            const domain = (config.config as any).domain;
            if (domain) {
                await this.upsertDict(manager, {
                    key: "domain",
                    value: domain,
                    group,
                    description: "当前激活的存储域名",
                    isEnabled: true,
                });
            }
        }
    }

    private async upsertDict(
        manager: EntityManager,
        data: {
            key: string;
            value: string;
            group: string;
            description?: string;
            isEnabled: boolean;
        },
    ): Promise<void> {
        const existDict = await manager.findOne(Dict, {
            where: { key: data.key, group: data.group },
        });

        if (existDict) {
            await manager.update(
                Dict,
                { id: existDict.id },
                {
                    value: data.value,
                    description: data.description,
                    isEnabled: data.isEnabled,
                },
            );
        } else {
            const dict = manager.create(Dict, {
                ...data,
                sort: 0,
            });
            await manager.save(dict);
        }
    }
}
