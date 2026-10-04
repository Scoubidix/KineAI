// services/storage/gcsDriver.js — Pilote de stockage Google Cloud Storage
//
// Code SDK extrait de gcsStorageService.js, sans changement de comportement.
// Même contrat que cellarDriver.js. À retirer au ménage GCS.
const { Storage } = require('@google-cloud/storage');

function createGcsDriver({ bucketName }) {
  // Identifiants Firebase existants (même compte de service que Firebase Admin).
  const storage = new Storage({
    projectId: process.env.FIREBASE_PROJECT_ID,
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  });
  const bucket = storage.bucket(bucketName);

  return {
    name: 'gcs',
    bucket: bucketName,

    async put(key, body, { contentType, cacheControl, metadata }) {
      await bucket.file(key).save(body, {
        metadata: { contentType, cacheControl, metadata },
        resumable: false,
      });
    },

    async exists(key) {
      const [exists] = await bucket.file(key).exists();
      return exists;
    },

    async remove(key) {
      await bucket.file(key).delete();
    },

    async download(key, destinationPath) {
      await bucket.file(key).download({ destination: destinationPath });
    },

    async signedReadUrl(key, { expiresInMs, signingDate }) {
      const start = signingDate ?? Date.now();
      const [url] = await bucket.file(key).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: start + expiresInMs,
        ...(signingDate !== undefined && { accessibleAt: signingDate }),
      });
      return url;
    },

    async list(prefix) {
      const [files] = await bucket.getFiles({ prefix });
      return files.map((file) => ({ key: file.name, size: Number(file.metadata.size) }));
    },
  };
}

module.exports = { createGcsDriver };
