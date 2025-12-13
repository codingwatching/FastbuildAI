import { BaseService } from "@buildingai/base";
import { AliyunOssConfig } from "@buildingai/constants/shared/storage-config.constant";
import { FileUploadService, type UploadFileResult } from "@buildingai/core/modules";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { File } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { RemoteUploadDto } from "@modules/upload/dto/remote-upload.dto";
import { Injectable } from "@nestjs/common";
import OSS, { STS } from "ali-oss";
import { getCredential } from "ali-oss/lib/common/signUtils";
import { getStandardRegion } from "ali-oss/lib/common/utils/getStandardRegion";
import { policy2Str } from "ali-oss/lib/common/utils/policy2Str";
import { Request } from "express";

/**
 * File upload service (API layer)
 *
 * Handles HTTP request-specific logic and delegates core operations to FileUploadService
 */
@Injectable()
export class UploadService extends BaseService<File> {
    /**
     * Constructor
     *
     * @param fileRepository File repository
     * @param fileUploadService Core file upload service
     */
    constructor(
        @InjectRepository(File)
        private readonly fileRepository: Repository<File>,
        private readonly fileUploadService: FileUploadService,
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

    async getAliyunOssUploadSignature(config: AliyunOssConfig) {
        let sts = new STS({ accessKeyId: config.accessKey, accessKeySecret: config.secretKey });

        const result = await sts.assumeRole(config.arn, "", 3600);
        const accessKeyId = result.credentials.AccessKeyId;
        const accessKeySecret = result.credentials.AccessKeySecret;
        const securityToken = result.credentials.SecurityToken;

        const client = new OSS({
            bucket: config.bucket,
            region: config.region,
            accessKeyId,
            accessKeySecret,
            stsToken: securityToken,
        });

        // Set the signature expiration time to 10 minutes later than the current time
        const date = new Date();
        const expirationDate = new Date(date);
        expirationDate.setMinutes(date.getMinutes() + 10);

        // Format the date in UTC time string format that complies with the ISO 8601 standard
        function padTo2Digits(num) {
            return num.toString().padStart(2, "0");
        }
        function formatDateToUTC(date: Date) {
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
        }
        const formattedDate = formatDateToUTC(expirationDate);

        // Generate x-oss-credential
        const credential = getCredential(
            formattedDate.split("T")[0],
            getStandardRegion(config.region),
            accessKeyId,
        );

        // Create a policy(list required fields)
        const policy = {
            expiration: expirationDate.toISOString(),
            conditions: [
                { bucket: config.bucket },
                { "x-oss-credential": credential },
                { "x-oss-signature-version": "OSS4-HMAC-SHA256" },
                { "x-oss-date": formattedDate },
                { "x-oss-security-token": securityToken },
            ],
        };

        const signature = (client as any).signPostObjectPolicyV4(policy, date);

        return {
            domain: config.domain,
            bucket: config.bucket,
            policy: Buffer.from(policy2Str(policy), "utf8").toString("base64"),
            ossSignatureVersion: "OSS4-HMAC-SHA256",
            ossCredential: credential,
            ossDate: formattedDate,
            signature: signature,
            securityToken: securityToken,
        };
    }
}
