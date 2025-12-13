export const StorageType = {
    LOCAL: "local",
    OSS: "oss",
    COS: "cos",
    KODO: "kodo",
} as const;

export type StorageTypeType = (typeof StorageType)[keyof typeof StorageType];

export interface LocalStorageConfig {}

interface CloudStorageConfig {
    bucket: string;
    accessKey: string;
    secretKey: string;
    domain: string;
}

export interface AliyunOssConfig extends CloudStorageConfig {
    endpoint?: string;
    arn?: string;
}

export interface TencentCosConfig extends CloudStorageConfig {
    region: string;
}

export interface QiniuKodoConfig extends CloudStorageConfig {}

export interface StorageConfigMap {
    [StorageType.LOCAL]: LocalStorageConfig | null | undefined;
    [StorageType.OSS]: AliyunOssConfig;
    [StorageType.COS]: TencentCosConfig;
    [StorageType.KODO]: QiniuKodoConfig;
}

export type StorageConfigData =
    | LocalStorageConfig
    | AliyunOssConfig
    | TencentCosConfig
    | QiniuKodoConfig;
