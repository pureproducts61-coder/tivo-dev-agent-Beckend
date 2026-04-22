FROM node:20-slim

WORKDIR /app

# Ensure we have a clean state
COPY package.json ./
# Install production dependencies only
RUN npm install --omit=dev

# Copy the build artifacts and the server
COPY dist ./dist
COPY server.js ./

# Set environment to production
ENV NODE_ENV=production
# Hugging Face Spaces default port
ENV PORT=7860
EXPOSE 7860

# Command to run the Express server
CMD ["node", "server.js"]
