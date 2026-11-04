---
name: spring-framework
description: Spring Boot / Spring Framework conventions for this project
---

# Spring Framework Conventions

Use only as supplement to `cline-instructions.md` (project rules win on conflict).

## Stack

- Java 17+ (use records, sealed classes, pattern matching where helpful).
- Spring Boot 3.4+, Jakarta EE, Jakarta Validation.
- Maven build.

## DI & Components

- Constructor injection only. No field injection in new code.
- Annotations: `@SpringBootApplication`, `@RestController`, `@Service`, `@Repository`, `@Configuration`.

## Web / Errors

- REST controllers expose generated OpenAPI interfaces.
- Errors handled centrally via `@ControllerAdvice` + `@ExceptionHandler`. No per-controller error payloads.

## Config

- `application.yml` + Spring Profiles.
- Type-safe config via `@ConfigurationProperties` (+ `@ConfigurationPropertiesScan`); prefer records.

## Persistence

- Spring Data JPA when a real DB is involved (note: tc-hub repositories wrap Teamcenter SOA, not JPA).

## Testing

- JUnit 5 + Spring Boot Test.
- MockMvc for web. `@SpringBootTest` for integration. Slices (`@WebMvcTest`, `@DataJpaTest`) for focused tests.

## Observability / Docs

- SLF4J + Log4j2 (`spring-boot-starter-log4j2`). Levels: ERROR / WARN / INFO / DEBUG.
- Spring Boot Actuator for metrics.
- Springdoc OpenAPI for API docs.

## Performance

- Spring Cache abstraction for caching.
- `@Async` for non-blocking ops.
- Tune JDBC pools / fetch strategies / indexes when relevant.

## Security

- Spring Security for authn/authz. BCrypt for passwords. CORS as needed.

## Naming

- PascalCase classes, camelCase methods/vars, ALL_CAPS constants.
