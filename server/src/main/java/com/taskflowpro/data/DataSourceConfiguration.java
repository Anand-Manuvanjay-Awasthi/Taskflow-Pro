package com.taskflowpro.data;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataSourceConfiguration {
    @Bean
    DataSource dataSource(@Value("${spring.datasource.url}") String databaseUrl) {
        createSqliteParentDirectory(databaseUrl);
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(databaseUrl);
        config.setDriverClassName("org.sqlite.JDBC");
        config.setMaximumPoolSize(1);
        return new HikariDataSource(config);
    }

    private void createSqliteParentDirectory(String databaseUrl) {
        String prefix = "jdbc:sqlite:";
        if (!databaseUrl.startsWith(prefix)) return;
        String location = databaseUrl.substring(prefix.length());
        if (location.equals(":memory:") || location.startsWith("file:")) return;
        Path parent = Path.of(location).toAbsolutePath().getParent();
        if (parent == null) return;
        try {
            Files.createDirectories(parent);
        } catch (IOException exception) {
            throw new IllegalStateException("could not create SQLite data directory: " + parent, exception);
        }
    }
}
