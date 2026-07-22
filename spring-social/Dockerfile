# ---------- Stage 1: build the jar ----------
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

# Cache deps first: wrapper + pom only, so this layer is reused unless
# pom.xml changes.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline

# Build the jar (tests run on H2 in the local verify loop; skip in the image).
COPY src ./src
RUN ./mvnw -B -q -DskipTests package

# ---------- Stage 2: slim runtime image ----------
FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app

# Non-root runtime user.
RUN groupadd --system bodh && useradd --system --gid bodh bodh

COPY --from=build /workspace/target/*.jar app.jar
RUN mkdir -p /app/uploads && chown -R bodh:bodh /app

USER bodh

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
# Activated via SPRING_PROFILES_ACTIVE from compose; datasource + CORS + JWT
# live in the `production` doc of application.yml.
EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
