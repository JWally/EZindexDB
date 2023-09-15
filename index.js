/**
 * A class to simplify interactions with IndexedDB.
 */
export default class EZindexDB{
  
  #database;
  
  /**
   * Initializes a connection to the database or creates it if it doesn't exist.
   * 
   * @param {string} database - The name of the database.
   * @param {string} table - The name of the table (object store).
   * @param {Array<string>} [indexes] - An array of index names to be created.
   * @returns {Promise<boolean>} Resolves to true if successful.
   */
  start = (database, table, indexes) => {
    return new Promise((resolve, reject) => {
      // start connection to DB, then, listen for events
      const openRequest = indexedDB.open(database, 1);
  
      // handle error
      openRequest.onerror = event => {
        reject(event.target.error);
      };
  
      // upgradeNeeded ???
      openRequest.onupgradeneeded = event => {
        this.#database = event.target.result;
        const store = this.#database.createObjectStore(table, {"keyPath": "id"});
        
        // If we're taking indexes, let's create indexes
        if(indexes){
          indexes.forEach((index) => store.createIndex(index,index));
        }
      };
  
      openRequest.onsuccess = event => {
        this.#database = event.target.result;
        resolve(true);
      };
    });
  }
  
  /**
   * Creates a transaction for internal use.
   * 
   * @private
   * @param {string} table - The name of the table (object store).
   * @returns {IDBObjectStore} The object store for the specified table.
   */
  #transaction = async(table) => {
    const transaction = await this.#database.transaction(table, 'readwrite');
    const store = transaction.objectStore(table);
    return store;
  }
  
  
  /**
   * Adds a record to the database if it doesn't exist.
   * Throws an error if the record already exists.
   * 
   * @param {string} table - The name of the table (object store).
   * @param {Object} data - The data to be added.
   * @returns {Promise<IDBValidKey>} Resolves to the key of the added record.
   */
  creates = (table, data) => {
    return new Promise((resolve, reject) => {
      // start a transaction
      const transaction = this.#database.transaction(table, 'readwrite');
      const store = transaction.objectStore(table);
  
      // Try adding data to the store
      const request = store.add(data);
  
      request.onsuccess = () => {
        resolve(request.result);
      };
  
      request.onerror = (event) => {
        console.error("Error adding data to IndexedDB:", event.target.error);
        reject(event.target.error);
      };
  
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error("Transaction error:", event.target.error);
      };
    });
  }
  
  
  /**
   * Retrieves a record from the database by its ID.
   * 
   * @param {string} table - The name of the table (object store).
   * @param {IDBValidKey} id - The ID of the record to retrieve.
   * @returns {Promise<Object>} Resolves to the retrieved record.
   */
  reads = (table, id) => {
    return new Promise((resolve, reject) => {
      // start a transaction
      const transaction = this.#database.transaction(table, 'readonly');
      const store = transaction.objectStore(table);
      
      // Try getting some information out of the database
      const request = store.get(id);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
  
      request.onerror = (event) => {
        console.error("Error reading data from IndexedDB:", event.target.error);
        reject(event.target.error);
      };
  
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error("Transaction error:", event.target.error);
      };
    });
  }
  
  
  /**
   * Updates an existing record in the database.
   * Throws an error if the record doesn't exist.
   * 
   * @param {string} table - The name of the table (object store).
   * @param {Object} data - The data to update.
   * @returns {Promise<IDBValidKey>} Resolves to the key of the updated record.
   */
  updates = (table, data) => {
    return new Promise(async (resolve, reject) => {
      // see if the thing exists first.
      // if not, fail it
      let test_data = await this.reads(table, data.id);
      
      if(!test_data){
        reject(new Error("A record must exist before you can update it"));
      }
  
      // start a transaction
      const transaction = this.#database.transaction(table, 'readwrite');
      const store = transaction.objectStore(table);
      
      // Try updating data in the store
      const request = store.put({...test_data, ...data});
      
      request.onsuccess = () => {
        resolve(request.result);
      };
  
      request.onerror = (event) => {
        console.error("Error updating data in IndexedDB:", event.target.error);
        reject(event.target.error);
      };
  
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error("Transaction error:", event.target.error);
      };
    });
  }
  
  /**
   * Inserts or updates a record in the database.
   * 
   * @param {string} table - The name of the table (object store).
   * @param {Object} data - The data to insert or update.
   * @returns {Promise<IDBValidKey>} Resolves to the key of the inserted or updated record.
   */
  upserts = (table, data) => {
    return new Promise(async (resolve, reject) => {
      // see if the thing exists first.
      // if not, fail it
      let test_data = await this.reads(table, data.id);
  
      // start a transaction
      const transaction = this.#database.transaction(table, 'readwrite');
      const store = transaction.objectStore(table);
      let request;

      // Try updating data in the store
      if(test_data){
        request = store.put({...test_data, ...data});
      } else {
        request = store.add(data);
      }
 
      
      request.onsuccess = () => {
        resolve(request.result);
      };
  
      request.onerror = (event) => {
        console.error("Error updating data in IndexedDB:", event.target.error);
        reject(event.target.error);
      };
  
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error("Transaction error:", event.target.error);
      };
    });
  }
  
  /**
   * Deletes a record from the database by its ID.
   * 
   * @param {string} table - The name of the table (object store).
   * @param {IDBValidKey} id - The ID of the record to delete.
   * @returns {Promise<boolean>} Resolves to true if the deletion was successful.
   */
  deletes = (table, id) => {
    return new Promise((resolve, reject) => {
      // start a transaction
      const transaction = this.#database.transaction(table, 'readwrite');
      const store = transaction.objectStore(table);
      
      // Try deleting the record from the store
      const request = store.delete(id);
      
      request.onsuccess = () => {
        resolve(true);
      };
  
      request.onerror = (event) => {
        console.error("Error deleting record from IndexedDB:", event.target.error);
        reject(event.target.error);
      };
  
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error("Transaction error:", event.target.error);
      };
    });
  }
  
  /**
   * Searches for records in the database by a specified field and value.
   * 
   * @param {string} table - The name of the table (object store).
   * @param {string} field - The name of the field to search by.
   * @param {any} value - The value to search for.
   * @returns {Promise<Array<Object>>} Resolves to an array of matching records.
   */
  searches = (table, field, value) => {
    return new Promise((resolve, reject) => {
      // start a transaction
      const transaction = this.#database.transaction(table, 'readonly');
      const store = transaction.objectStore(table);
      
      // Set Reference to our Index
      let ndx = store.index(field);
      
      // Try getting some information out of the database
      const request = ndx.getAll(value);
      
      request.onsuccess = () => {
        // The result of the request will be in request.result
        resolve(request.result);
      };
  
      request.onerror = (event) => {
        console.error("Error reading from IndexedDB:", event.target.error);
        reject(event.target.error);
      };
      
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error("Transaction error:", event.target.error);
      };
    });
  }
  
  
}

/////////////////////////////////
// DEMO:
/////////////////////////////////

/*
// Instantiate the DB
  let ez = new EZindexDB();
  
//
// List any of the fields we might want to search on
// that aren't "id"
//
  await ez.start("company","people",["name"]);

//
// Demonstration of adding people to our DB
//
  await ez.creates("people",{"id": "1", "salary": 12, "name": "STEVE"});
  await ez.creates("people",{"id": "2", "salary": 12, "name": "EDDY"});
  await ez.creates("people",{"id": "3", "salary": 12, "name": "JOE"});
  await ez.creates("people",{"id": "4", "salary": 13, "name": "JOE"});

//
// Find everybody named "JOE"
//
  let data = await ez.searches("people","name", "JOE");
  
//
// Set Joe's Salary to 12_000
//
  await ez.updates("people",{"id": "3", "salary": 12_000});
  
//
// Make sure we can't 'upsert' a record
//
  await ez.updates("people",{"id": "newb", "salary": 12_000});  // this one fails
*/

