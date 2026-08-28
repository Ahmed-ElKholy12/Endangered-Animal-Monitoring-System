CREATE DATABASE SpeciesMigrationDB;
GO
USE SpeciesMigrationDB;
-- deleting any existing tables to avoid error
DROP TABLE IF EXISTS OBSERVATION_LOG;
DROP TABLE IF EXISTS Animal;
DROP TABLE IF EXISTS RANGER;
DROP TABLE IF EXISTS CORRIDOR;
DROP TABLE IF EXISTS SPECIES;
GO
GO

CREATE TABLE SPECIES (
    Spec_ID       INT            NOT NULL,
    Spec_Name     VARCHAR(100)   NOT NULL,
    Danger_Level  VARCHAR(50)    NOT NULL,
    Diet_Type     VARCHAR(50)    NOT NULL,  
    CONSTRAINT PK_SPECIES PRIMARY KEY CLUSTERED (Spec_ID),
    CONSTRAINT CHK_Danger_Level CHECK (Danger_Level IN ('High', 'Medium', 'Low')),
    CONSTRAINT CHK_Diet_Type    CHECK (Diet_Type    IN ('Carnivore', 'Herbivore', 'Omnivore'))
);
GO

CREATE TABLE CORRIDOR (
    Corr_ID    INT           NOT NULL,
    Corr_Name  VARCHAR(100)  NOT NULL,
    climate    VARCHAR(50)   NOT NULL,
    CONSTRAINT PK_CORRIDOR PRIMARY KEY CLUSTERED (Corr_ID)
);
GO

CREATE TABLE RANGER (
    Rang_ID    INT             NOT NULL,
    Rang_Name  VARCHAR(100)    NOT NULL,
    Phone      VARCHAR(20)     NULL,        
    Salary     DECIMAL(10, 2)  NOT NULL,
    CONSTRAINT PK_RANGER PRIMARY KEY CLUSTERED (Rang_ID)
);
GO

CREATE TABLE Animal (
    Ani_ID         INT           NOT NULL,
    Ani_Age        INT           NULL,       
    Health_Status  VARCHAR(100)  NOT NULL,
    Spec_ID        INT           NOT NULL,
    Corr_ID        INT           NOT NULL,
    CONSTRAINT PK_Animal PRIMARY KEY CLUSTERED (Ani_ID),
    CONSTRAINT CHK_Health_Status CHECK (Health_Status IN ('Healthy', 'Injured', 'Critical')),
   
    CONSTRAINT FK_Animal_SPECIES FOREIGN KEY (Spec_ID)
        REFERENCES SPECIES(Spec_ID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,                  
    CONSTRAINT FK_Animal_CORRIDOR FOREIGN KEY (Corr_ID)
        REFERENCES CORRIDOR(Corr_ID)
        ON UPDATE CASCADE
        ON DELETE NO ACTION 
);
GO

CREATE TABLE OBSERVATION_LOG (
    Log_ID    INT   NOT NULL,
    Log_Date  DATE  NOT NULL,
    Ani_ID    INT   NOT NULL,
    Rang_ID   INT   NOT NULL,
    Corr_ID   INT   NOT NULL,
    CONSTRAINT PK_OBSERVATION_LOG PRIMARY KEY CLUSTERED (Log_ID),

    CONSTRAINT FK_LOG_Animal FOREIGN KEY (Ani_ID)
        REFERENCES Animal(Ani_ID)
        ON UPDATE CASCADE
        ON DELETE NO ACTION,                
    CONSTRAINT FK_LOG_RANGER FOREIGN KEY (Rang_ID)
        REFERENCES RANGER(Rang_ID)
        ON UPDATE CASCADE
        ON DELETE NO ACTION,
    CONSTRAINT FK_LOG_CORRIDOR FOREIGN KEY (Corr_ID)
        REFERENCES CORRIDOR(Corr_ID)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);
GO

INSERT INTO SPECIES (Spec_ID, Spec_Name, Danger_Level, Diet_Type) VALUES
(101, 'Bengal Tiger',      'High',   'Carnivore'),
(102, 'African Elephant',  'Medium', 'Herbivore'),
(103, 'Black Rhino',       'High',   'Herbivore'),
(104, 'Snow Leopard',      'High',   'Carnivore'),
(105, 'Golden Eagle',      'Low',    'Carnivore');
GO

INSERT INTO CORRIDOR (Corr_ID, Corr_Name, climate) VALUES
(201, 'Northern Valley Pass',    'Alpine'),
(202, 'Savannah Wetlands Link',  'Tropical'),
(203, 'Eastern Forest Ridge',    'Temperate'),
(204, 'Canyon River Route',      'Arid');
GO

INSERT INTO RANGER (Rang_ID, Rang_Name, Phone, Salary) VALUES
(301, 'John Doe',      '+1-555-0198', 45000.00),
(302, 'Jane Smith',    '+1-555-0143', 48500.00),
(303, 'Carlos Mendez', NULL,          42000.00),
(304, 'Amina Yusuf',   '+1-555-0177', 51000.00);
GO

INSERT INTO Animal (Ani_ID, Ani_Age, Health_Status, Spec_ID, Corr_ID) VALUES
(401, 5,    'Healthy',  101, 203), 
(402, 12,   'Injured',  102, 202), 
(403, 3,    'Healthy',  104, 201), 
(404, NULL, 'Critical', 103, 202), 
(405, 2,    'Healthy',  105, 204); 
GO

INSERT INTO OBSERVATION_LOG (Log_ID, Log_Date, Ani_ID, Rang_ID, Corr_ID) VALUES
(501, '2026-03-15', 401, 301, 203),  
(502, '2026-03-16', 402, 304, 202),  
(503, '2026-03-18', 403, 302, 201),
(504, '2026-04-02', 404, 304, 202),  
(505, '2026-04-10', 401, 303, 203),  
(506, '2026-05-01', 405, 301, 204);  
GO
SELECT 
    A.Ani_ID, 
    S.Spec_Name, 
    A.Ani_Age, 
    A.Health_Status, 
    S.Danger_Level
FROM Animal A
JOIN SPECIES S ON A.Spec_ID = S.Spec_ID;

SELECT 
    L.Log_ID, 
    L.Log_Date, 
    R.Rang_Name AS Ranger_Name, 
    S.Spec_Name AS Animal_Species, 
    C.Corr_Name AS Corridor_Location
FROM OBSERVATION_LOG L
JOIN RANGER R ON L.Rang_ID = R.Rang_ID
JOIN Animal A ON L.Ani_ID = A.Ani_ID
JOIN SPECIES S ON A.Spec_ID = S.Spec_ID
JOIN CORRIDOR C ON L.Corr_ID = C.Corr_ID;

SELECT 
    C.Corr_Name, 
    C.climate, 
    COUNT(A.Ani_ID) AS Total_Animals
FROM CORRIDOR C
LEFT JOIN Animal A ON C.Corr_ID = A.Corr_ID
GROUP BY C.Corr_Name, C.climate;

SELECT 
    L.Log_ID, 
    R.Rang_Name, 
    R.Salary, 
    L.Log_Date, 
    L.Ani_ID
FROM OBSERVATION_LOG L
JOIN RANGER R ON L.Rang_ID = R.Rang_ID
WHERE R.Salary > 45000.00;

SELECT 
    A.Ani_ID, 
    S.Spec_Name, 
    A.Health_Status, 
    C.Corr_Name
FROM Animal A
JOIN SPECIES S ON A.Spec_ID = S.Spec_ID
JOIN CORRIDOR C ON A.Corr_ID = C.Corr_ID
WHERE A.Health_Status IN ('Injured', 'Critical');

SELECT * FROM OBSERVATION_LOG