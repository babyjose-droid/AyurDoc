declare const BUCKETS: {
    readonly clinicAssets: string;
    readonly patientDocs: string;
    readonly generatedPdfs: string;
};
type BucketKey = keyof typeof BUCKETS;
export declare function validateMimeType(context: string, mimeType: string): boolean;
export declare function buildS3Key(context: string, clinicId: string, filename: string, subId?: string): string;
export declare function uploadFile(bucket: BucketKey, key: string, body: Buffer, mimeType: string, metadata?: Record<string, string>): Promise<string>;
export declare function deleteFile(bucket: BucketKey, key: string): Promise<void>;
export declare function getPresignedUrl(bucket: BucketKey, key: string, expiresInSeconds?: number): Promise<string>;
export declare function getAssetUrl(key: string): string;
export {};
//# sourceMappingURL=s3.d.ts.map