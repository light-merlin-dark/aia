import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encrypt, decrypt, hashValue, maskValue } from '../../src/config/crypto';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs');

// Store generated keys for consistent encrypt/decrypt
let generatedKey: Buffer | null = null;

describe('crypto module', () => {
  const mockKeyPath = '/test/key';
  const testData = 'This is sensitive data';
  const mockKey = Buffer.from('a'.repeat(32)); // 32 bytes key
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data successfully', async () => {
      // Mock fs operations to capture generated key
      vi.mocked(fs.existsSync).mockImplementation((_path) => {
        return generatedKey !== null;
      });
      
      vi.mocked(fs.writeFileSync).mockImplementation((_path, data) => {
        if (Buffer.isBuffer(data) && data.length === 32) {
          generatedKey = data;
        }
      });
      
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        if (!generatedKey) throw new Error('Key not generated');
        return generatedKey;
      });
      
      const encrypted = await encrypt(testData, mockKeyPath);
      
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(testData);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
      
      const decrypted = await decrypt(encrypted, mockKeyPath);
      expect(decrypted).toBe(testData);
    });
    
    it('should create key file with restrictive permissions if not exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      
      await encrypt(testData, mockKeyPath);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockKeyPath,
        expect.any(Buffer),
        { mode: 0o600 }
      );
    });
    
    it('should throw error if config exists but key is missing', async () => {
      const mockConfigPath = '/test/config.enc';
      
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === mockKeyPath) return false;
        if (path === mockConfigPath) return true;
        return false;
      });
      
      await expect(encrypt(testData, mockKeyPath))
        .rejects.toThrow('Configuration exists but encryption key is missing');
    });
    
    it('should use existing key if available', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey);
      
      await encrypt(testData, mockKeyPath);
      
      expect(fs.readFileSync).toHaveBeenCalledWith(mockKeyPath);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
    
    it('should throw error when decrypting without key file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      await expect(decrypt('encrypted-data', mockKeyPath))
        .rejects.toThrow('Encryption key not found');
    });
    
    it('should handle empty strings', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey);
      
      const encrypted = await encrypt('', mockKeyPath);
      const decrypted = await decrypt(encrypted, mockKeyPath);
      
      expect(decrypted).toBe('');
    });
    
    it('should handle unicode data', async () => {
      const unicodeData = '🚀 Unicode test: 你好世界!';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey);
      
      const encrypted = await encrypt(unicodeData, mockKeyPath);
      const decrypted = await decrypt(encrypted, mockKeyPath);
      
      expect(decrypted).toBe(unicodeData);
    });
    
    it('should produce different encrypted output for same data (due to random IV)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey);
      
      const encrypted1 = await encrypt(testData, mockKeyPath);
      const encrypted2 = await encrypt(testData, mockKeyPath);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same value
      const decrypted1 = await decrypt(encrypted1, mockKeyPath);
      const decrypted2 = await decrypt(encrypted2, mockKeyPath);
      
      expect(decrypted1).toBe(testData);
      expect(decrypted2).toBe(testData);
    });
    
    it('should fail to decrypt corrupted data', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey);
      
      const encrypted = await encrypt(testData, mockKeyPath);
      
      // Corrupt the encrypted data
      const corrupted = encrypted.slice(0, -10) + 'corrupted';
      
      await expect(decrypt(corrupted, mockKeyPath)).rejects.toThrow();
    });
    
    it('should fail to decrypt with wrong key', async () => {
      // Encrypt with one key
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockKey);
      
      const encrypted = await encrypt(testData, mockKeyPath);
      
      // Try to decrypt with different key
      const wrongKey = Buffer.from('b'.repeat(32));
      vi.mocked(fs.readFileSync).mockReturnValue(wrongKey);
      
      await expect(decrypt(encrypted, mockKeyPath)).rejects.toThrow();
    });
  });
  
  describe('hashValue', () => {
    it('should produce consistent hash for same value', () => {
      const value = 'test-api-key';
      const hash1 = hashValue(value);
      const hash2 = hashValue(value);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });
    
    it('should produce different hashes for different values', () => {
      const hash1 = hashValue('value1');
      const hash2 = hashValue('value2');
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should handle empty strings', () => {
      const hash = hashValue('');
      expect(hash).toHaveLength(64);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
    
    it('should handle unicode values', () => {
      const hash = hashValue('🔐 Security test');
      expect(hash).toHaveLength(64);
    });
  });
  
  describe('maskValue', () => {
    it('should mask middle portion of value', () => {
      const masked = maskValue('sk-1234567890abcdef', 4);
      // Total length 19, visible 8 (4+4), masked = max(8, 19-8) = 11
      expect(masked).toBe('sk-1***********cdef');
    });
    
    it('should use default 4 visible chars', () => {
      const masked = maskValue('secret-api-key-value');
      expect(masked).toBe('secr************alue');
    });
    
    it('should fully mask short values', () => {
      const masked = maskValue('short', 4);
      expect(masked).toBe('*****');
    });
    
    it('should handle values equal to visible chars threshold', () => {
      const masked = maskValue('12345678', 4);
      expect(masked).toBe('********');
    });
    
    it('should ensure minimum masked length', () => {
      const masked = maskValue('1234567890', 4);
      expect(masked).toBe('1234********7890');
      expect(masked).toContain('********'); // At least 8 asterisks
    });
    
    it('should handle empty strings', () => {
      const masked = maskValue('');
      expect(masked).toBe('');
    });
    
    it('should handle single character', () => {
      const masked = maskValue('a');
      expect(masked).toBe('*');
    });
    
    it('should handle custom visible chars count', () => {
      const masked = maskValue('very-long-secret-key', 6);
      // Total length 20, visible 12 (6+6), masked = max(8, 20-12) = 8
      expect(masked).toBe('very-l********et-key');
    });
  });
});