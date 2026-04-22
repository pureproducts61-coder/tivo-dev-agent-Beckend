FROM node:20-slim

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the build output and server file
COPY dist ./dist
COPY server.js ./

# Set environment to production
ENV NODE_ENV=production
# Hugging Face Spaces standard port
ENV PORT=7860
EXPOSE 7860

# We need to make sure express is installed for the server to run
RUN npm install express

CMD ["node", "server.js"]
