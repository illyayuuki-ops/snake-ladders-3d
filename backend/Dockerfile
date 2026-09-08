# ---- build ----
FROM maven:3.9-eclipse-temurin-11 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -q dependency:resolve || true
COPY src ./src
RUN mvn -B -q package -DskipTests

# ---- run ----
FROM eclipse-temurin:11-jre
WORKDIR /app
COPY --from=build /app/target/snakes-ladders-3d.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
