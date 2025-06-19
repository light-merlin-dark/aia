import { 
  createCipheriv, 
  createDecipheriv, 
  randomBytes, 
  scryptSync,
  createHash
} from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Generate or load encryption key
 */
function getOrCreateKey(keyPath: string): Buffer {
  if (existsSync(keyPath)) {
    return readFileSync(keyPath);
  }
  
  // Check if config exists without key (config persistence issue)
  const configPath = keyPath.replace(/key$/, 'config.enc');
  if (existsSync(configPath)) {
    throw new Error(
      'Configuration exists but encryption key is missing. ' +
      'This can happen after reinstalling the package. ' +
      'To recover: 1) Back up your API keys, 2) Run "aia reset", 3) Reconfigure services.'
    );
  }
  
  // Generate a new key
  const key = randomBytes(KEY_LENGTH);
  writeFileSync(keyPath, key, { mode: 0o600 }); // Restrictive permissions
  return key;
}

/**
 * Encrypt data using AES-256-GCM
 */
export async function encrypt(data: string, keyPath: string): Promise<string> {
  const key = getOrCreateKey(keyPath);
  const iv = randomBytes(IV_LENGTH);
  const salt = randomBytes(SALT_LENGTH);
  
  // Derive key from the master key using salt
  const derivedKey = scryptSync(key, salt, KEY_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  // Combine salt, iv, tag, and encrypted data
  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  
  return combined.toString('base64');
}

/**
 * Decrypt data using AES-256-GCM
 */
export async function decrypt(encryptedData: string, keyPath: string): Promise<string> {
  if (!existsSync(keyPath)) {
    throw new Error('Encryption key not found');
  }
  
  const key = readFileSync(keyPath);
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  // Derive key from the master key using salt
  const derivedKey = scryptSync(key, salt, KEY_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Hash a value for comparison (e.g., API key validation)
 */
export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Mask sensitive values for display
 */
export function maskValue(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }
  
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const masked = '*'.repeat(Math.max(8, value.length - visibleChars * 2));
  
  return `${start}${masked}${end}`;
}