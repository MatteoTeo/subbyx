require('dotenv').config();
const mysql = require('mysql2/promise');

class Database {
  constructor() {
    if (!Database.instance) {
      Database.instance = this; // Salva l'istanza corrente per il Singleton
      this.pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
    }
    return Database.instance;
  }

  async query(sql, params) {
    try {
      const [results] = await this.pool.query(sql, params);
      return results;
    } catch (error) {
      console.error('Errore durante l\'esecuzione della query:', error);
      throw error;
    }
  }

  async close() {
    try {
      await this.pool.end();
      console.log('Connessione al database chiusa con successo.');
    } catch (error) {
      console.error('Errore durante la chiusura della connessione:', error);
      throw error;
    }
  }
}

const dbInstance = new Database();
Object.freeze(dbInstance); // Rende l'istanza immutabile

module.exports = dbInstance;