# TIVO DEV AGENT BACKEND — HF Space Build Engine
# Supports: APK (Android), EXE (Windows via electron-packager), Web bundles
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV GRADLE_HOME=/opt/gradle
ENV PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${GRADLE_HOME}/bin:${PATH}"
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV NODE_OPTIONS="--max-old-space-size=4096"

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget unzip git git-lfs \
    openjdk-17-jdk-headless \
    nodejs npm \
    python3 python3-pip \
    nginx \
    wine64 wine32 \
    xvfb \
    zip tar \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Android SDK
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && cd ${ANDROID_HOME}/cmdline-tools \
    && wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O tools.zip \
    && unzip -q tools.zip \
    && mv cmdline-tools latest \
    && rm tools.zip

RUN yes | sdkmanager --licenses > /dev/null 2>&1 || true
RUN sdkmanager \
    "platform-tools" \
    "platforms;android-34" \
    "build-tools;34.0.0" \
    "ndk;26.1.10909125" \
    && sdkmanager --update

# Gradle 8.5
RUN wget -q https://services.gradle.org/distributions/gradle-8.5-bin.zip -O /tmp/gradle.zip \
    && unzip -q /tmp/gradle.zip -d /opt \
    && mv /opt/gradle-8.5 ${GRADLE_HOME} \
    && rm /tmp/gradle.zip

# Electron packager for EXE builds
RUN npm install -g @electron/packager electron

# Build API server
WORKDIR /app

COPY server.js /app/server.js
COPY build-apk.sh /app/build-apk.sh
COPY build-exe.sh /app/build-exe.sh
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chmod +x /app/build-apk.sh /app/build-exe.sh

# Copy frontend dist if exists
COPY dist/ /usr/share/nginx/html/ 

EXPOSE 7860

# Start nginx + build API
CMD nginx && node /app/server.js
