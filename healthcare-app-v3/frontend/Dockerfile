FROM node:18

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]