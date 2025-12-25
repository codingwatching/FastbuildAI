import { StorageType } from "@buildingai/constants";
import { StorageConfig } from "@buildingai/db/entities";
import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request } from "express";
import { Repository } from "typeorm";

import { CloudStorageService } from "../../cloud-storage";
import type { FileStorageOptions } from "../interfaces/file-storage.interface";
import { FileUploadService } from "./file-upload.service";

@Injectable()
export class UploadService {
    @Inject()
    private fileUploadService: FileUploadService;

    @Inject()
    private cloudStorageService: CloudStorageService;

    @InjectRepository(StorageConfig)
    private readonly repository: Repository<StorageConfig>;

    async uploadFile(
        file: Express.Multer.File,
        request: Request,
        description?: string,
        options?: FileStorageOptions,
    ) {
        const storageConfig = await this.getActiveStorageConfig();
        if (storageConfig.storageType === StorageType.LOCAL) {
            return await this.fileUploadService.uploadFile(file, request, description, options);
        }

        const pathConfig = await this.fileUploadService.createCloudStoragePath(
            { name: file.originalname, size: file.size },
            options,
        );

        const uploadResult = await this.cloudStorageService.upload({
            file,
            description,
            storageConfig,
            path: pathConfig.storage.fullPath,
        });

        return {
            id: "",
            url: uploadResult.url,
            originalName: pathConfig.metadata.originalName,
            size: pathConfig.metadata.size,
            mimeType: pathConfig.metadata.mimeType,
            extension: pathConfig.metadata.extension,
        };
    }

    async uploadFiles(
        files: Array<Express.Multer.File>,
        request: Request,
        description?: string,
        options?: FileStorageOptions,
    ) {
        const tasks = files.map((file) => {
            return this.uploadFile(file, request, description, options);
        });

        return Promise.all(tasks);
    }

    async uploadRemoteFile() {
        throw new Error("Not implemented.");
    }

    private getActiveStorageConfig(): Promise<StorageConfig> {
        return this.repository.findOne({ where: { isActive: true } });
    }
}
