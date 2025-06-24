# Usa un'immagine base per Node.js
FROM node:20

# Imposta la directory di lavoro all'interno del container
WORKDIR /index

# Copia i file di configurazione
COPY package*.json ./

# Installa le dipendenze
RUN npm install

# Copia il codice sorgente dell'app
COPY . .

# Espone la porta su cui l'applicazione verrà eseguita
EXPOSE 3000

# Comando per avviare l'applicazione
CMD ["node", "index.js"]
