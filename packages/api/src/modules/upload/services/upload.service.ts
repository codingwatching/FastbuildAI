import { BaseService } from "@buildingai/base";
import { RedisService } from "@buildingai/cache";
import { AliyunOssConfig } from "@buildingai/constants/shared/storage-config.constant";
import { FileUploadService, type UploadFileResult } from "@buildingai/core/modules";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { File } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { RemoteUploadDto } from "@modules/upload/dto/remote-upload.dto";
import { SignatureRequestDto } from "@modules/upload/dto/upload-file.dto";
import { Injectable } from "@nestjs/common";
import OSS, { STS } from "ali-oss";
import { getCredential } from "ali-oss/lib/common/signUtils";
import { getStandardRegion } from "ali-oss/lib/common/utils/getStandardRegion";
import { policy2Str } from "ali-oss/lib/common/utils/policy2Str";
import { Request } from "express";

interface AliyunSTSResult {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken: string;
}

/**
 * File upload service (API layer)
 *
 * Handles HTTP request-specific logic and delegates core operations to FileUploadService
 */
@Injectable()
export class UploadService extends BaseService<File> {
    private readonly CACHE_PREFIX = "sts:credentials";

    /**
     * Constructor
     *
     * @param fileRepository File repository
     * @param fileUploadService Core file upload service
     * @param cacheService Redis service
     */
    constructor(
        @InjectRepository(File)
        private readonly fileRepository: Repository<File>,
        private readonly fileUploadService: FileUploadService,
        private readonly cacheService: RedisService,
    ) {
        super(fileRepository);
    }

    /**
     * Save uploaded file
     *
     * @param file Uploaded file
     * @param request Express request object
     * @param description File description
     * @param extensionId Extension ID
     * @returns Upload result
     */
    async saveUploadedFile(
        file: Express.Multer.File,
        request: Request,
        description?: string,
        extensionId?: string,
    ): Promise<UploadFileResult> {
        return this.fileUploadService.uploadFile(
            file,
            request,
            description,
            extensionId ? { extensionId } : undefined,
        );
    }

    /**
     * Save multiple uploaded files
     *
     * @param files Array of uploaded files
     * @param request Express request object
     * @param description File description
     * @param extensionId Extension ID
     * @returns Array of upload results
     */
    async saveUploadedFiles(
        files: Express.Multer.File[],
        request: Request,
        description?: string,
        extensionId?: string,
    ): Promise<UploadFileResult[]> {
        return this.fileUploadService.uploadFiles(
            files,
            request,
            description,
            extensionId ? { extensionId } : undefined,
        );
    }

    /**
     * Get file by ID
     *
     * @param id File ID
     * @returns File entity
     */
    async getFileById(id: string): Promise<Partial<File>> {
        return this.fileUploadService.findOneById(id);
    }

    /**
     * Delete file
     *
     * @param id File ID
     * @returns Success status
     */
    async deleteFile(id: string): Promise<boolean> {
        await this.fileUploadService.deleteFileById(id);
        return true;
    }

    /**
     * Get file physical path
     *
     * @param id File ID
     * @returns File physical path
     */
    async getFilePath(id: string): Promise<string> {
        return this.fileUploadService.getFilePath(id);
    }

    /**
     * Upload remote file
     *
     * @param remoteUploadDto Remote upload parameters
     * @param request Express request object
     * @returns Upload result
     */
    async uploadRemoteFile(
        remoteUploadDto: RemoteUploadDto,
        request: Request,
    ): Promise<UploadFileResult> {
        const { url, description, extensionId } = remoteUploadDto;

        return this.fileUploadService.uploadRemoteFile(
            url,
            request,
            description,
            extensionId ? { extensionId } : undefined,
        );
    }

    generateCloudStorageInfo(dto: SignatureRequestDto) {
        return this.fileUploadService.createCloudStoragePath(dto);
    }

    async getAliyunOssUploadSignature(config: AliyunOssConfig) {
        const stsResult = await this.getSTSCredentials(config);
        const signature = await this.getAliyunSignature(config, stsResult);

        return {
            ...signature,
            host: config.domain,
            bucket: config.bucket,
            securityToken: stsResult.securityToken,
        };
    }

    private async getAliyunSignature(config: AliyunOssConfig, sts: AliyunSTSResult) {
        const client = new OSS({
            bucket: config.bucket,
            region: config.region,
            accessKeyId: sts.accessKeyId,
            accessKeySecret: sts.accessKeySecret,
            stsToken: sts.securityToken,
        });

        // Set the signature expiration time to 10 minutes later than the current time
        const date = new Date();
        const expirationDate = new Date(date);
        expirationDate.setMinutes(date.getMinutes() + 10);

        // Format the date in UTC time string format that complies with the ISO 8601 standard
        const padTo2Digits = (num: number) => num.toString().padStart(2, "0");
        const formatDateToUTC = (date: Date) => {
            return (
                date.getUTCFullYear() +
                padTo2Digits(date.getUTCMonth() + 1) +
                padTo2Digits(date.getUTCDate()) +
                "T" +
                padTo2Digits(date.getUTCHours()) +
                padTo2Digits(date.getUTCMinutes()) +
                padTo2Digits(date.getUTCSeconds()) +
                "Z"
            );
        };
        const formattedDate = formatDateToUTC(expirationDate);

        // Generate x-oss-credential
        const credential = getCredential(
            formattedDate.split("T")[0],
            getStandardRegion(config.region),
            sts.accessKeyId,
        );

        // Create a policy(list required fields)
        const ossSignatureVersion = "OSS4-HMAC-SHA256";
        const policy = {
            expiration: expirationDate.toISOString(),
            conditions: [
                { bucket: config.bucket },
                { "x-oss-credential": credential },
                { "x-oss-signature-version": ossSignatureVersion },
                { "x-oss-date": formattedDate },
                { "x-oss-security-token": sts.securityToken },
            ],
        };

        const signature = (client as any).signPostObjectPolicyV4(policy, date);

        return {
            signature,
            ossSignatureVersion,
            policy: Buffer.from(policy2Str(policy)).toString("base64"),
            ossCredential: credential,
            ossDate: formattedDate,
        };
    }

    private async getSTSCredentials(config: AliyunOssConfig): Promise<AliyunSTSResult> {
        const cacheKey = `${this.CACHE_PREFIX}:oss`;
        const cachedResult = await this.cacheService.getHash<{
            accessKeyId: string;
            accessKeySecret: string;
            securityToken: string;
        }>(cacheKey);

        if (cachedResult) {
            return cachedResult;
        }

        let sts = new STS({ accessKeyId: config.accessKey, accessKeySecret: config.secretKey });
        const expirationSeconds = 3600;
        const result = await sts.assumeRole(config.arn, "", expirationSeconds);

        const credentials = {
            accessKeyId: result.credentials.AccessKeyId,
            accessKeySecret: result.credentials.AccessKeySecret,
            securityToken: result.credentials.SecurityToken,
        };

        await this.cacheService.setHash(cacheKey, credentials, expirationSeconds);

        return credentials;
    }
}
