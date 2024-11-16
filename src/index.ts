export type ValidTableName = `${string}-${string}` | `${string}_${string}`; // Requires hyphen or underscore
export type ValidDatabaseName = `${string}-db` | `${string}_db`; // Must end with -db or _db
export type ValidIndexName = `${string}-index` | `${string}_index`;

export type ValidKeyPath = 
  | string  // Single key path
  | `${string}.${string}` // Nested key path
  | string[]; // Compound key path

export interface ValidIndexConfig {
  name: ValidIndexName;
  keyPath: ValidKeyPath;
  options?: {
    unique?: boolean;
    multiEntry?: boolean;
  };
}

type DBRecord = {
  id?: IDBValidKey
  [key: string]: any
}

interface IndexConfig {
  name: string
  keyPath: string
  options?: IDBIndexParameters
}

class EZIndexDB {
  private db: IDBDatabase | null = null
  private memoryStore: Map<string, Map<IDBValidKey, DBRecord>> = new Map()
  private useMemoryFallback: boolean = false
  private version: number
  private autoIncrementCounter: Map<string, number> = new Map()

  constructor(useMemoryFallback: boolean = false, version: number = 1) {
    this.useMemoryFallback = useMemoryFallback
    this.version = version
  }

  // Runtime validation that matches the type definitions
  private isValidTableName(name: string): name is ValidTableName {
    return /^[a-zA-Z0-9]+[-_][a-zA-Z0-9]+$/.test(name);
  }

  private isValidDatabaseName(name: string): name is ValidDatabaseName {
    return /^[a-zA-Z0-9]+[-_]db$/.test(name);
  }

  private validateIndexConfig(index: string | ValidIndexConfig): void {
    // If it's just a string, it should be a valid field name
    if (typeof index === 'string') {
      if (!/^[a-zA-Z0-9]+[-_]?[a-zA-Z0-9]+$/.test(index)) {
        throw new Error(`Invalid index name: ${index}. Must be a valid field name.`);
      }
      return;
    }

    // Check name format
    if (!index.name.endsWith('-index') && !index.name.endsWith('_index')) {
      throw new Error(`Invalid index name: ${index.name}. Must end with -index or _index`);
    }

    // Check keyPath
    if (Array.isArray(index.keyPath)) {
      // Validate compound key path
      if (index.keyPath.length === 0) {
        throw new Error('Compound keyPath cannot be empty');
      }
      
      index.keyPath.forEach(path => {
        if (!/^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*$/.test(path)) {
          throw new Error(`Invalid keyPath segment: ${path}`);
        }
      });
    } else {
      // Validate string keyPath
      if (!/^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*$/.test(index.keyPath)) {
        throw new Error(`Invalid keyPath: ${index.keyPath}`);
      }
    }

    // Validate options if present
    if (index.options) {
      const validOptions = ['unique', 'multiEntry'];
      const providedOptions = Object.keys(index.options);
      
      providedOptions.forEach(option => {
        if (!validOptions.includes(option)) {
          throw new Error(`Invalid option: ${option}`);
        }
        
        if (typeof index.options![option as keyof IDBIndexParameters] !== 'boolean') {
          throw new Error(`Option ${option} must be a boolean`);
        }
      });

      // Validate multiEntry is not used with compound keyPath
      if (index.options.multiEntry && Array.isArray(index.keyPath)) {
        throw new Error('multiEntry option cannot be used with compound keyPath');
      }
    }
  }


  /**
   * Initializes a connection to the database or creates it if it doesn't exist.
   *
   * @param database - The name of the database
   * @param table - The name of the table (object store)
   * @param indexes - Array of index configurations or simple index names
   * @returns Promise resolving to true if successful
   */
  async start(database: ValidDatabaseName, table: ValidTableName, indexes: (string | ValidIndexConfig)[] = []): Promise<boolean> {

    // Runtime validation
    if (!this.isValidDatabaseName(database)) {
      throw new Error('Invalid database name. Must end with -db or _db');
    }
    if (!this.isValidTableName(table)) {
      throw new Error('Invalid table name. Must contain hyphen or underscore');
    }

    // Validate all indexes before proceeding
    indexes.forEach(index => this.validateIndexConfig(index));

    if (this.useMemoryFallback ) {
      this.memoryStore.set(table, new Map())
      this.autoIncrementCounter.set(table, 1)
      return Promise.resolve(true)
    }

    if(!globalThis.indexedDB){
      throw new Error('Failed to open database:')
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(database, this.version)
      
      request.onerror = (event) => {
        event.preventDefault()
        reject(new Error(`Failed to open database: ${request.error?.message}`))
      }

      request.onblocked = (event) => {
        reject(new Error('Database opening blocked. Please close other tabs using this app.'))
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        try {
          if (db.objectStoreNames.contains(table)) {
            // Handle existing store upgrades
            const store = request.transaction!.objectStore(table)
            
            // Check for new indexes
            const existingIndexes = Array.from(store.indexNames)
            indexes.forEach((index) => {
              const indexName = typeof index === 'string' ? index : index.name
              if (!existingIndexes.includes(indexName)) {
                if (typeof index === 'string') {
                  store.createIndex(index, index)
                } else {
                  store.createIndex(index.name, index.keyPath, index.options)
                }
              }
            })
          } else {
            const store = db.createObjectStore(table, {
              keyPath: 'id',
              autoIncrement: true,
            })

            indexes.forEach((index) => {
              if (typeof index === 'string') {
                store.createIndex(index, index)
              } else {
                store.createIndex(index.name, index.keyPath, index.options)
              }
            })
          }
        } catch (error) {
          reject(error)
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        
        // Add global error handler
        this.db.onerror = (event) => {
          event.preventDefault()
          console.error('Database error:', event)
        }
        
        resolve(true)
      }
    })
  }

  private validateConnection(): void {
    if (!this.db && !this.useMemoryFallback) {
      throw new Error('Database connection not initialized. Call start() first.')
    }
  }

  private getMemoryTable(table: string): Map<IDBValidKey, DBRecord> {
    if (!this.memoryStore.has(table)) {
      throw new Error(`Table ${table} not initialized in memory.`)
    }
    return this.memoryStore.get(table)!
  }

  private getNextId(table: string): number {
    const counter = this.autoIncrementCounter.get(table) || 1
    this.autoIncrementCounter.set(table, counter + 1)
    return counter
  }

  private getStore(table: string, mode: IDBTransactionMode): IDBObjectStore {
    this.validateConnection()
    const transaction = this.db!.transaction(table, mode)
    
    transaction.onerror = (event) => {
      event.preventDefault()
      throw new Error(`Transaction failed: ${transaction.error?.message}`)
    }
    
    transaction.onabort = () => {
      throw new Error('Transaction was aborted')
    }
    
    return transaction.objectStore(table)
  }

  async creates(table: string, data: DBRecord): Promise<IDBValidKey> {
    if (this.useMemoryFallback) {
      const memoryTable = this.getMemoryTable(table)
      const id = data.id || this.getNextId(table)
      data.id = id
      memoryTable.set(id, structuredClone(data))
      return id
    }

    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(table, 'readwrite')
        const request = store.add(data)

        request.onerror = (event) => {
          event.preventDefault()
          reject(new Error(`Failed to create record: ${request.error?.message}`))
        }
        
        request.onsuccess = () => resolve(request.result)
      } catch (error) {
        reject(error)
      }
    })
  }

  async reads(table: string, id: IDBValidKey): Promise<DBRecord> {

    if (this.useMemoryFallback) {
      const memoryTable = this.getMemoryTable(table)
      const record = memoryTable.get(id)
      if (!record) throw new Error(`Record with ID ${id} not found in memory`)
      return structuredClone(record)
    }

    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(table, 'readonly')
        const request = store.get(id)

        request.onerror = (event) => {
          event.preventDefault()
          reject(new Error(`Failed to read record: ${request.error?.message}`))
        }
        
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result)
          } else {
            reject(new Error(`Record with ID ${id} not found`))
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  async updates(table: string, data: DBRecord): Promise<IDBValidKey> {

    if (!data.id) {
      throw new Error('Record must have an ID to update')
    }

    if (this.useMemoryFallback) {
      const memoryTable = this.getMemoryTable(table)
      if (!memoryTable.has(data.id)) {
        throw new Error(`Record with ID ${data.id} not found for update`)
      }
      memoryTable.set(data.id, structuredClone(data))
      return data.id
    }

    // Prevent upserts by trying to find the record
    // and throwing an error if it doesn't find it...
    const record = await this.reads(table, data.id)

    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(table, 'readwrite')
        const request = store.put(data)

        request.onerror = (event) => {
          event.preventDefault()
          reject(new Error(`Failed to update record: ${request.error?.message}`))
        }
        
        request.onsuccess = () => resolve(request.result)
      } catch (error) {
        reject(error)
      }
    })
  }

  async deletes(table: string, id: IDBValidKey): Promise<boolean> {
    if (this.useMemoryFallback) {
      const memoryTable = this.getMemoryTable(table)
      return memoryTable.delete(id)
    }

    // Prevent upserts by trying to find the record
    // and throwing an error if it doesn't find it...
    const record = await this.reads(table, id)

    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(table, 'readwrite')
        const request = store.delete(id)

        request.onerror = (event) => {
          event.preventDefault()
          reject(new Error(`Failed to delete record: ${request.error?.message}`))
        }
        
        request.onsuccess = () => resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  }

  async getAll(table: string): Promise<DBRecord[]> {
    if (this.useMemoryFallback) {
      const memoryTable = this.getMemoryTable(table)
      return Array.from(memoryTable.values()).map(record => structuredClone(record))
    }

    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(table, 'readonly')
        const request = store.getAll()

        request.onerror = (event) => {
          event.preventDefault()
          reject(new Error(`Failed to get all records: ${request.error?.message}`))
        }
        
        request.onsuccess = () => resolve(request.result)
      } catch (error) {
        reject(error)
      }
    })
  }

  async countRecords(table: string): Promise<number> {
    if (this.useMemoryFallback) {
      const memoryTable = this.getMemoryTable(table)
      return memoryTable.size
    }

    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(table, 'readonly')
        const request = store.count()

        request.onerror = (event) => {
          event.preventDefault()
          reject(new Error(`Failed to count records: ${request.error?.message}`))
        }
        
        request.onsuccess = () => resolve(request.result)
      } catch (error) {
        reject(error)
      }
    })
  }

  async close(): Promise<void> {
    if (this.useMemoryFallback) {
      this.memoryStore.clear()
      this.autoIncrementCounter.clear()
    } else if (this.db) {
      // Just close the database since we can't reliably track pending transactions
      // All pending transactions will complete or abort before the database actually closes
      this.db.close()
      this.db = null
    }
  }
}

export { EZIndexDB, type DBRecord, type IndexConfig }