// services/storage/cellarDriver.js — Pilote de stockage Cellar (S3 Clever Cloud)
//
// Même contrat que gcsDriver.js : put, exists, remove, download, signedReadUrl, list.
// Spec : docs/superpowers/specs/2026-10-03-migration-cellar-design.md
const fs = require('fs');
const { pipeline } = require('stream/promises');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function createCellarDriver({ host, keyId, keySecret, bucket }) {
  const client = new S3Client({
    // Région imposée par le SDK, ignorée par Cellar.
    region: 'us-east-1',
    endpoint: `https://${host}`,
    forcePathStyle: false,
    credentials: { accessKeyId: keyId, secretAccessKey: keySecret },
    // Depuis la 3.729, le SDK ajoute des sommes CRC32 que les stockages S3
    // non-AWS refusent : on ne les envoie que si l'opération l'exige.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    name: 'cellar',
    bucket,

    async put(key, body, { contentType, cacheControl, metadata }) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
        Metadata: metadata,
      }));
    },

    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false;
        throw error;
      }
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async download(key, destinationPath) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      await pipeline(response.Body, fs.createWriteStream(destinationPath));
    },

    async signedReadUrl(key, { expiresInMs, signingDate }) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: Math.floor(expiresInMs / 1000),
        ...(signingDate !== undefined && { signingDate: new Date(signingDate) }),
      });
    },

    async list(prefix) {
      const objects = [];
      let continuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }));
        for (const object of page.Contents ?? []) objects.push({ key: object.Key, size: object.Size });
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return objects;
    },
  };
}

module.exports = { createCellarDriver };
