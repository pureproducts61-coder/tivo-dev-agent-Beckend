FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install -g serve
EXPOSE 7860
CMD ["serve", "-s", ".", "-l", "7860"]
