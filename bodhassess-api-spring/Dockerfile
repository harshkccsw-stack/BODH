# ---------- Stage 1: build the jar ----------
FROM maven:3.8.6-eclipse-temurin-11 AS build
WORKDIR /workspace

# Cache deps first
COPY pom.xml ./
RUN mvn -B -q -e -DskipTests dependency:go-offline

# Build
COPY src ./src
RUN mvn -B -q -e -DskipTests package

# ---------- Stage 2: slim runtime image ----------
FROM eclipse-temurin:11-jre AS runtime
WORKDIR /app

# Non-root user for runtime
RUN groupadd --system bodh && useradd --system --gid bodh bodh

COPY --from=build /workspace/target/*.jar app.jar
RUN mkdir -p /app/uploads && chown -R bodh:bodh /app

USER bodh

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENV SPRING_PROFILES_ACTIVE=prod

EXPOSE 4000

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
