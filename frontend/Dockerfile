FROM node:20-alpine AS build

WORKDIR /app

# Accept build args and set them as environment variables
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the frontend code and build
COPY . .
RUN npm run build

# Use Nginx to serve the static files
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
