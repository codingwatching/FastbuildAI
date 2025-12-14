export const StorageType = {
    LOCAL: "local",
    OSS: "oss",
    COS: "cos",
    KODO: "kodo",
} as const;

export type StorageTypeType = (typeof StorageType)[keyof typeof StorageType];

interface CloudStorageConfig {
    bucket: string;
    accessKey: string;
    secretKey: string;
    domain: string;
    region: string;
}

export interface AliyunOssConfig extends CloudStorageConfig {
    arn: string;
}

export type LocalStorageConfig = null;
export type TencentCosConfig = CloudStorageConfig;
export type QiniuKodoConfig = CloudStorageConfig;

export interface StorageConfigMap {
    [StorageType.LOCAL]: LocalStorageConfig;
    [StorageType.OSS]: AliyunOssConfig;
    [StorageType.COS]: TencentCosConfig;
    [StorageType.KODO]: QiniuKodoConfig;
}

export type StorageConfigData =
    | LocalStorageConfig
    | AliyunOssConfig
    | TencentCosConfig
    | QiniuKodoConfig;
