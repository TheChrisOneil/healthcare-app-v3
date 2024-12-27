# Use the Node.js LTS image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy only package.json and package-lock.json to leverage caching
COPY package.json ./

# Install dependencies
# Clear npm cache before installation
RUN npm install 

# Create storage directories with appropriate permissions
RUN mkdir -p /app/storage/audioTestFiles /app/storage/recordings /app/storage/transcriptions \
    && chmod 755 /app/storage/audioTestFiles /app/storage/recordings /app/storage/transcriptions

# Set up logging directory
RUN mkdir -p /app/logs && chmod 755 /app/logs

# Debug: List the contents of the /app/storage directory
RUN ls -l /app/storage || echo "Storage directory not found"

# Copy the rest of the application code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Expose necessary ports (optional)
EXPOSE 3000

# Command to start the service
CMD ["npm", "start"]
