import 'fake-indexeddb/auto'; // Automatically mocks indexedDB globally
import { EZIndexDB, DBRecord,ValidDatabaseName, ValidTableName } from '../src/index';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals'
import { IDBFactory } from "fake-indexeddb";

describe('EZIndexDB', () => {
  let dbName: ValidDatabaseName = 'test-db';
  let tableName: ValidTableName = 'test-table'
  let db: EZIndexDB;

  beforeEach(() => {
    indexedDB = new IDBFactory();
    db = new EZIndexDB();
  });

  afterEach(async () => {
    //await db.clearDatabase(dbName);
    db.close();
  });

  it('should initialize a database with memory fallback', async () => {
    db = new EZIndexDB(true);
    const success = await db.start(dbName, tableName);
    expect(success).toBe(true);
  });

  it('should initialize a database with IndexedDB', async () => {
    const success = await db.start(dbName, tableName);
    expect(success).toBe(true);
  });

  it('should create a record', async () => {
    await db.start(dbName, tableName);
    const data: DBRecord = { name: 'Test Record' };
    const id = await db.creates(tableName, data);
    expect(id).toBeDefined();
  });

  it('should read a record by ID', async () => {
    await db.start(dbName, tableName);
    const data: DBRecord = { name: 'Test Record' };
    const id = await db.creates(tableName, data);
    const record = await db.reads(tableName, id);
    expect(record).toMatchObject(data);
  });

  it('should update a record', async () => {
    await db.start(dbName, tableName);
    const data: DBRecord = { name: 'Test Record' };
    const id = await db.creates(tableName, data);
    const updatedData: DBRecord = { id, name: 'Updated Record' };
    const updatedId = await db.updates(tableName, updatedData);
    expect(updatedId).toBe(id);
    const record = await db.reads(tableName, id);
    expect(record.name).toBe('Updated Record');
  });

  it('should delete a record', async () => {
    await db.start(dbName, tableName);
    const data: DBRecord = { name: 'Test Record' };
    const id = await db.creates(tableName, data);
    const success = await db.deletes(tableName, id);
    expect(success).toBe(true);
    await expect(db.reads(tableName, id)).rejects.toThrow();
  });

  it('should retrieve all records', async () => {
    await db.start(dbName, tableName);
    await db.creates(tableName, { name: 'Record 1' });
    await db.creates(tableName, { name: 'Record 2' });
    const records = await db.getAll(tableName);
    expect(records.length).toBe(2);
  });

  it('should count all records', async () => {
    await db.start(dbName, tableName);
    await db.creates(tableName, { name: 'Record 1' });
    await db.creates(tableName, { name: 'Record 2' });
    const count = await db.countRecords(tableName);
    expect(count).toBe(2);
  });

  it('should throw error if start() is not called before operations', async () => {
    await expect(db.creates(tableName, { name: 'Test Record' })).rejects.toThrow();
  });

  it('should throw an error if IndexedDB is unavailable and fallback is disabled', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    (globalThis as any).indexedDB = undefined; // Temporarily override indexedDB
  
    db = new EZIndexDB(false);
    await expect(db.start(dbName, tableName)).rejects.toThrow(
      'Failed to open database:'
    );
  
    globalThis.indexedDB = originalIndexedDB; // Restore IndexedDB
  });
  
  
  it('should retrieve all records correctly in memory fallback', async () => {
    db = new EZIndexDB(true);
    await db.start(dbName, tableName);
    await db.creates(tableName, { name: 'Memory Record 1' });
    await db.creates(tableName, { name: 'Memory Record 2' });
  
    const records = await db.getAll(tableName);
    expect(records.length).toBe(2);
  });
  

  it('should return an empty array when retrieving all records from an empty table', async () => {
    await db.start(dbName, tableName);
    const records = await db.getAll(tableName);
    expect(records).toEqual([]);
  });
  
  it('should properly close the database', async () => {
    await db.start(dbName, tableName);
    await db.close();
    expect(() => db.creates(tableName, { name: 'Record After Close' })).rejects.toThrow(
      'Database connection not initialized. Call start() first.'
    );
  });

  it('should generate incremental IDs for memory fallback', async () => {
    db = new EZIndexDB(true);
    await db.start(dbName, tableName);
  
    const id1 = await db.creates(tableName, { name: 'Record 1' });
    const id2 = await db.creates(tableName, { name: 'Record 2' });
  
    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });
  
  it('should throw an error when accessing a non-existent memory table', async () => {
    db = new EZIndexDB(true);
    await db.start(dbName, tableName);
    await expect(db.getAll('nonExistentTable')).rejects.toThrow(
      'Table nonExistentTable not initialized in memory.'
    );
  });
  
  it('should throw an error when updating a record that doesn’t exist', async () => {
    await db.start(dbName, tableName);
    const fakeRecord: DBRecord = { id: 999, name: 'Nonexistent Record' };
    await expect(db.updates(tableName, fakeRecord)).rejects.toThrow(
      'Record with ID 999 not found'
    );
  });

  it('should return false when trying to delete a non-existent record', async () => {
    await db.start(dbName, tableName);
    await expect(db.deletes(tableName, 999)).rejects.toThrow(
      'Record with ID 999 not found'
    );
  });
  
  
  it('should return zero for record count on an empty table', async () => {
    await db.start(dbName, tableName);
    const count = await db.countRecords(tableName);
    expect(count).toBe(0);
  });
  

  describe('Memory fallback mode', () => {
    beforeEach(() => {
      db = new EZIndexDB(true);
    });

    it('should create, read, update, delete, and retrieve records in memory', async () => {
      await db.start(dbName, tableName);

      // Create
      const data: DBRecord = { name: 'Memory Record' };
      const id = await db.creates(tableName, data);

      // Read
      const record = await db.reads(tableName, id);
      expect(record).toMatchObject(data);

      // Update
      const updatedData: DBRecord = { id, name: 'Updated Memory Record' };
      const updatedId = await db.updates(tableName, updatedData);
      expect(updatedId).toBe(id);

      // Delete
      const success = await db.deletes(tableName, id);
      expect(success).toBe(true);

      // Get all
      const allRecords = await db.getAll(tableName);
      expect(allRecords.length).toBe(0);
    });
  });




});
