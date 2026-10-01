FROM maven:3.9-eclipse-temurin-11 AS build
WORKDIR /app
COPY backend/pom.xml backend/pom.xml
COPY backend/src backend/src
COPY frontend frontend
RUN mvn -B -q -f backend/pom.xml package -DskipTests

FROM eclipse-temurin:11-jre
WORKDIR /app
COPY --from=build /app/backend/target/snakes-ladders-3d.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
