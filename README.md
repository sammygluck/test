## how to run the server

cd srcs

mkdir db  
mkdir ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ./ssl/server.key \
        -out ./ssl/server.cert \
        -subj "/C=BE/ST=Antwerp/L=Antwerp/O=Transcendence/OU=IT/CN=localhost"

cd frontend  
npx tsc

cd ../backend  
npm install  
node ./init/db_init.js  
node server


server runs on https://localhost:3000
# test
