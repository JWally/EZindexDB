import 'fake-indexeddb/auto';
import { EZIndexDB, DBRecord, ValidIndexConfig, ValidDatabaseName, ValidTableName, ValidIndexName } from '../src/index';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals'
import { IDBFactory } from "fake-indexeddb";

describe('EZIndexDB Error Handling and Edge Cases', () => {
  let db: EZIndexDB;
  let dbName: ValidDatabaseName = 'test-db';
  let tableName: ValidTableName = 'test-table';

  beforeEach(() => {
    indexedDB = new IDBFactory();
    db = new EZIndexDB();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Database initialization', () => {
    it('should handle database upgrade with existing table and new indexes', async () => {
      // First initialization
      await db.start(dbName, tableName);
      await db.close();

      // Second initialization with new indexes
      db = new EZIndexDB(false, 2); // New version number
      const indexes: ValidIndexConfig[] = [
        { name: 'name-index', keyPath: 'name' },
        { name: 'date-index', keyPath: 'date' }
      ];
      
      const success = await db.start(dbName, tableName, indexes);
      expect(success).toBe(true);
    });
  });

  describe('CRUD operations error handling', () => {
    it('should handle creating a record with invalid data', async () => {
      await db.start(dbName, tableName);
      
      const invalidData = {
        get name() {
          throw new Error('Invalid data');
        }
      };

      await expect(db.creates(tableName, invalidData)).rejects.toThrow();
    });

    it('should handle updating a record without an ID', async () => {
      await db.start(dbName, tableName);
      const data: DBRecord = { name: 'No ID Record' };
      
      await expect(db.updates(tableName, data)).rejects.toThrow(
        'Record must have an ID to update'
      );
    });

    it('should handle reading a non-existent record', async () => {
      await db.start(dbName, tableName);
      const nonExistentId = 999;

      await expect(db.reads(tableName, nonExistentId)).rejects.toThrow(
        `Record with ID ${nonExistentId} not found`
      );
    });
  });

  describe('Memory fallback error handling', () => {
    beforeEach(() => {
      db = new EZIndexDB(true);
    });

    it('should handle accessing an uninitialized table in memory mode', async () => {
      await db.start(dbName, tableName);
      const wrongTable = 'wrong-table';

      await expect(db.getAll(wrongTable)).rejects.toThrow(
        `Table ${wrongTable} not initialized in memory`
      );
    });

    it('should handle updating non-existent record in memory mode', async () => {
      await db.start(dbName, tableName);
      const data: DBRecord = { id: 999, name: 'Non-existent' };

      await expect(db.updates(tableName, data)).rejects.toThrow(
        `Record with ID ${data.id} not found for update`
      );
    });

    it('should handle reading non-existent record in memory mode', async () => {
      await db.start(dbName, tableName);
      const nonExistentId = 999;

      await expect(db.reads(tableName, nonExistentId)).rejects.toThrow(
        `Record with ID ${nonExistentId} not found in memory`
      );
    });
  });

  describe('Index management', () => {
    it('should handle creating and using indexes', async () => {
      const indexes: (string | ValidIndexConfig)[] = [
        'simpleIndex',
        { name: 'complex-index', keyPath: 'nested.field' }
      ];

      await db.start(dbName, tableName, indexes);
      
      // Create a record that uses the indexes
      const record: DBRecord = {
        simpleIndex: 'test',
        nested: { field: 'test' }
      };
      
      const id = await db.creates(tableName, record);
      expect(id).toBeDefined();

      const retrieved = await db.reads(tableName, id);
      expect(retrieved).toMatchObject(record);
    });
  });

  describe('Multiple operations', () => {
    it('should handle multiple operations in sequence', async () => {
      await db.start(dbName, tableName);

      // Create multiple records
      const ids = await Promise.all([
        db.creates(tableName, { value: 1 }),
        db.creates(tableName, { value: 2 }),
        db.creates(tableName, { value: 3 })
      ]);

      // Read all records
      const records = await db.getAll(tableName);
      expect(records).toHaveLength(3);

      // Update all records
      await Promise.all(
        ids.map(id => db.updates(tableName, { id, value: 100 }))
      );

      // Verify updates
      const updatedRecords = await db.getAll(tableName);
      expect(updatedRecords.every(r => r.value === 100)).toBe(true);

      // Delete all records
      await Promise.all(ids.map(id => db.deletes(tableName, id)));

      // Verify deletion
      const finalRecords = await db.getAll(tableName);
      expect(finalRecords).toHaveLength(0);
    });
  });

  describe('Database versioning', () => {
    it('should handle version upgrades correctly', async () => {
      // Start with version 1
      await db.start(dbName, tableName);
      const id = await db.creates(tableName, { name: 'Test' });
      await db.close();

      // Upgrade to version 2
      const dbV2 = new EZIndexDB(false, 2);
      await dbV2.start(dbName, tableName, ['newIndex']);
      
      // Verify data persisted through upgrade
      const record = await dbV2.reads(tableName, id);
      expect(record.name).toBe('Test');
    });
  });
});








describe('EZIndexDB Additional Coverage Tests', () => {
  let db: EZIndexDB;
  const dbName = 'test-db';
  const tableName = 'test-table';

  beforeEach(() => {
    indexedDB = new IDBFactory();
    db = new EZIndexDB();
  });

  afterEach(async () => {
    await db.close();
  });

  it('should handle errors during store creation', async () => {
    // Use type assertion to tell TypeScript we're intentionally testing invalid data
    const invalidIndexConfig = {
      name: '' as ValidIndexName, // Invalid empty name
      keyPath: 'test'
    } as ValidIndexConfig;
    
    await expect(db.start(dbName, tableName, [invalidIndexConfig]))
      .rejects.toThrow();
  });

  // You might want to add more test cases
  it('should handle various invalid index configurations', async () => {
    const invalidConfigs = [
      {
        name: '' as ValidIndexName,
        keyPath: 'test'
      },
      {
        name: 'no-suffix' as ValidIndexName, // missing required -index suffix
        keyPath: 'test'
      },
      {
        name: 'valid-index' as ValidIndexName,
        keyPath: ''  // empty keyPath
      }
    ] as ValidIndexConfig[];

    for (const config of invalidConfigs) {
      await expect(db.start(dbName, tableName, [config]))
        .rejects.toThrow();
    }
  });

  describe('Connection validation', () => {
    it('should handle database errors', async () => {
      await db.start(dbName, tableName);
      
      // Force database error by closing and attempting operation
      await db.close();
      await expect(db.creates(tableName, { test: 'data' }))
        .rejects.toThrow('Database connection not initialized');
    });
  });

  describe('Transaction error handling', () => {
    it('should handle transaction errors during create operation', async () => {
      await db.start(dbName, tableName);
      
      // Create invalid data that will cause transaction error
      const invalidData = {
        toJSON: () => { throw new Error('Invalid data'); }
      };
      
      await expect(db.creates(tableName, invalidData))
        .rejects.toThrow();
    });
  });

  describe('CRUD operation errors', () => {
    it('should handle errors during create operation', async () => {
      await db.start(dbName, tableName);
      const db1 = await db.creates(tableName, { test: 'unique' });
      
      // Try to create duplicate unique record
      await expect(db.creates(tableName, { id: db1, test: 'unique' }))
        .rejects.toThrow();
    });

    it('should handle errors during read operation with invalid key', async () => {
      await db.start(dbName, tableName);
      
      // Try to read with invalid key (undefined cast as any)
      await expect(db.reads(tableName, undefined as any))
        .rejects.toThrow();
    });

    it('should handle errors during read operation with non-existent key', async () => {
      await db.start(dbName, tableName);
      const nonExistentKey = 999999;
      
      await expect(db.reads(tableName, nonExistentKey))
        .rejects.toThrow();
    });
  });

  describe('Update operation errors', () => {
    it('should handle errors during update with invalid data', async () => {
      await db.start(dbName, tableName);
      const id = await db.creates(tableName, { test: 'data' });
      
      const invalidData = {
        id,
        get test() { throw new Error('Invalid data'); }
      };
      
      await expect(db.updates(tableName, invalidData))
        .rejects.toThrow();
    });
  });

  describe('Delete operation errors', () => {
    it('should handle errors during delete operation with invalid key', async () => {
      await db.start(dbName, tableName);
      
      // Try to delete with invalid key (null cast as any)
      await expect(db.deletes(tableName, null as any))
        .rejects.toThrow();
    });

    it('should handle errors during delete operation with non-existent key', async () => {
      await db.start(dbName, tableName);
      const nonExistentKey = 999999;
      
      await expect(db.deletes(tableName, nonExistentKey))
        .rejects.toThrow();
    });
  });

  describe('GetAll operation errors', () => {
    it('should handle errors during getAll operation', async () => {
      await db.start(dbName, tableName);
      await db.close();
      
      // Try getAll after closing database
      await expect(db.getAll(tableName))
        .rejects.toThrow('Database connection not initialized');
    });
  });

  describe('Count and close operations', () => {
    it('should handle errors during count operation', async () => {
      await db.start(dbName, tableName);
      await db.close();
      
      // Try count after closing database
      await expect(db.countRecords(tableName))
        .rejects.toThrow('Database connection not initialized');
    });

    it('should handle multiple close operations', async () => {
      await db.start(dbName, tableName);
      await db.close();
      await db.close(); // Second close should not throw
    });
  });

  describe('Memory mode error paths', () => {
    beforeEach(() => {
      db = new EZIndexDB(true);
    });

    it('should handle errors in memory mode operations', async () => {
      await db.start(dbName, tableName);
      
      // Create a record
      const id = await db.creates(tableName, { test: 'data' });
      
      // Try operations with non-existent table
      await expect(db.reads('nonexistent', id))
        .rejects.toThrow('Table nonexistent not initialized in memory');
      
      await expect(db.updates('nonexistent', { id, test: 'updated' }))
        .rejects.toThrow('Table nonexistent not initialized in memory');
      
      await expect(db.deletes('nonexistent', id))
        .rejects.toThrow('Table nonexistent not initialized in memory');
      
      await expect(db.countRecords('nonexistent'))
        .rejects.toThrow('Table nonexistent not initialized in memory');
    });
  });

  describe('Edge cases for initialization', () => {
    it('should handle database name edge cases', async () => {
      await expect(db.start('' as any, tableName))
        .rejects.toThrow();
    });

    it('should handle table name edge cases', async () => {
      await expect(db.start(dbName, '' as any))
        .rejects.toThrow();
    });
  });
});