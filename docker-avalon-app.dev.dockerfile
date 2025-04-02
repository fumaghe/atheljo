# Usa un'immagine base Debian Bookworm (Node 20) che include una versione recente di Python
FROM node:20-bookworm-slim

# Installa le dipendenze di sistema necessarie per canvas, Python, pip e per compilare psycopg2 (libpq-dev)
RUN apt-get update && \
    apt-get install -y python3 python3-pip make g++ libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev libpq-dev && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

# Aggiorna npm alla versione 11.2.0 per gestire meglio le dipendenze
RUN npm install -g npm@11.2.0

WORKDIR /app

# Copia i file di configurazione per npm e le dipendenze di Node
COPY package*.json ./
# Copia il file .npmrc per forzare il registry e altre opzioni
COPY .npmrc ./

# Rimuove eventuale package-lock.json per forzare una nuova risoluzione
RUN rm -f package-lock.json

# Installa le dipendenze Node (forzando, se necessario)
RUN npm install --force

# Copia il file dei requisiti Python dalla cartella Archimedes2.0
COPY Archimedes2.0/requirements.txt ./Archimedes2.0/requirements.txt
# Installa le dipendenze Python necessarie, usando l'opzione --break-system-packages per bypassare il controllo
RUN pip3 install --break-system-packages -r Archimedes2.0/requirements.txt

# Copia il resto del codice (tutta la struttura del progetto)
COPY . .

# (Opzionale) Esegui il build della parte frontend se necessario
RUN npm run build

# Espone le porte usate dall'applicazione
EXPOSE 5000
EXPOSE 5173
EXPOSE 5174

# Avvia il comando di sviluppo definito in package.json
CMD ["npm", "run", "dev"]
