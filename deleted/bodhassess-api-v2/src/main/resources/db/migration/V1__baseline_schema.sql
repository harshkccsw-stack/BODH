create table AnswerOption (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, mediaType varchar(30), mediaUrl TEXT, sortOrder integer not null, text TEXT, createdById bigint, updatedById bigint, itemId bigint not null, primary key (id));
create table Assessment (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), autoNext bit not null, name varchar(200) not null, status enum ('ACTIVE','CLOSED','PAUSED','TEST') not null, createdById bigint, updatedById bigint, questionnaireId bigint not null, primary key (id));
create table AssessmentAttempt (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, archivedAt datetime(6), attemptNumber integer not null, completedAt datetime(6), startedAt datetime(6), status enum ('COMPLETED','IN_PROGRESS','NOT_STARTED') not null, createdById bigint, updatedById bigint, sessionId bigint not null, primary key (id));
create table AssessmentGroupAllotment (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, cap integer, createdById bigint, updatedById bigint, assessmentId bigint not null, groupId bigint not null, primary key (id));
create table AssessmentLanguage (assessmentId bigint not null, language varchar(8) not null, primary key (assessmentId, language));
create table AssessmentOrganizationAllotment (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, cap integer, createdById bigint, updatedById bigint, assessmentId bigint not null, organizationId bigint not null, primary key (id));
create table AssessmentRespondentAllotment (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, createdById bigint, updatedById bigint, assessmentId bigint not null, userId bigint not null, primary key (id));
create table AssessmentSession (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), consentId varchar(64), invitationSent bit not null, language varchar(8), name varchar(200), proctoring bit not null, showQuestionIndex bit not null, createdById bigint, updatedById bigint, assessmentId bigint not null, groupId bigint, organizationId bigint, userId bigint not null, primary key (id));
create table DemographicField (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), active bit not null, fieldKey varchar(128) not null, label varchar(200) not null, placeholder varchar(255), required bit not null, type enum ('DATE','NUMBER','SELECT','TEXT','TEXTAREA') not null, createdById bigint, updatedById bigint, primary key (id));
create table DemographicFieldOption (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, sortOrder integer not null, value varchar(255) not null, createdById bigint, updatedById bigint, fieldId bigint not null, primary key (id));
create table Item (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), format enum ('FREE_TEXT','IMAGE_CHOICE','LIKERT','MATRIX','MCQ','RANKING','RATING_SCALE','SJT') not null, irtA float(53), irtB float(53), irtC float(53), mediaType varchar(30), mediaUrl TEXT, riskFlag bit not null, riskRule TEXT, stem TEXT, subDomain varchar(150), validationStatus enum ('DRAFT','UNDER_REVIEW','VALIDATED') not null, createdById bigint, updatedById bigint, previousItemId bigint, primary key (id));
create table ItemLanguage (itemId bigint not null, language varchar(8) not null, primary key (itemId, language));
create table ItemUsageTraitScore (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, value float(53) not null, createdById bigint, updatedById bigint, placementId bigint not null, questionnaireItemId bigint not null, primary key (id));
create table MeasuredQuality (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), description TEXT, name varchar(150) not null, createdById bigint, updatedById bigint, primary key (id));
create table MeasuredQualityTrait (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), description TEXT, name varchar(150) not null, createdById bigint, updatedById bigint, primary key (id));
create table OptionUsageTraitScore (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, value float(53) not null, createdById bigint, updatedById bigint, questionnaireItemOptionId bigint not null, placementId bigint not null, primary key (id));
create table Organization (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), contactEmail varchar(255), contactName varchar(150), contactPhone varchar(20), name varchar(200) not null, status enum ('ACTIVE','PENDING','SUSPENDED') not null, website varchar(255), createdById bigint, updatedById bigint, primary key (id));
create table OrganizationMember (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, removedAt datetime(6), createdById bigint, updatedById bigint, organizationId bigint not null, userId bigint not null, primary key (id));
create table OrganizationModule (organizationId bigint not null, module varchar(128) not null, primary key (organizationId, module));
create table OrganizationVertical (organizationId bigint not null, vertical varchar(128) not null, primary key (organizationId, vertical));
create table Questionnaire (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), isAdaptive bit not null, ageRange varchar(50), category varchar(100), description TEXT, durationMinutes integer, isFixedSequence bit not null, name varchar(200) not null, normStatus varchar(50), scoringModel varchar(32), shortName varchar(50), tierRequired varchar(50), usesWeightedScoring bit not null, vertical varchar(100), createdById bigint, updatedById bigint, organizationId bigint, primary key (id));
create table QuestionnaireChangeLog (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, changeType enum ('DEMOGRAPHICS_CHANGED','ITEM_ADDED','ITEM_REMOVED','ITEM_REORDERED','ITEM_REPLACED','METADATA_UPDATED','OPTION_ORDER_CHANGED','SCORE_CHANGED','SECTION_CHANGED') not null, details TEXT, createdById bigint, updatedById bigint, questionnaireId bigint not null, primary key (id));
create table QuestionnaireDemographicField (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, sortOrder integer not null, createdById bigint, updatedById bigint, fieldId bigint not null, questionnaireId bigint not null, primary key (id));
create table QuestionnaireItem (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, sortOrder integer not null, createdById bigint, updatedById bigint, itemId bigint not null, questionnaireId bigint not null, sectionId bigint, primary key (id));
create table QuestionnaireItemOption (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, displayOrder integer not null, createdById bigint, updatedById bigint, optionId bigint not null, questionnaireItemId bigint not null, primary key (id));
create table QuestionnaireSection (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, sortOrder integer not null, title varchar(200) not null, createdById bigint, updatedById bigint, questionnaireId bigint not null, primary key (id));
create table RespondentGroup (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), description TEXT, name varchar(150) not null, createdById bigint, updatedById bigint, organizationId bigint not null, parentGroupId bigint, primary key (id));
create table RespondentGroupMember (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, removedAt datetime(6), createdById bigint, updatedById bigint, groupId bigint not null, userId bigint not null, primary key (id));
create table Role (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, description TEXT, name varchar(50) not null, createdById bigint, updatedById bigint, primary key (id));
create table RoleUrlPath (roleId bigint not null, urlPath varchar(255) not null, primary key (roleId, urlPath));
create table SessionAnswer (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, freeText TEXT, createdById bigint, updatedById bigint, attemptId bigint not null, itemId bigint not null, primary key (id));
create table SessionAnswerOption (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, rankOrder integer, createdById bigint, updatedById bigint, answerId bigint not null, optionId bigint not null, primary key (id));
create table SessionDemographic (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, value TEXT, createdById bigint, updatedById bigint, attemptId bigint not null, fieldId bigint not null, primary key (id));
create table SessionTraitScore (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, value float(53) not null, createdById bigint, updatedById bigint, attemptId bigint not null, placementId bigint not null, primary key (id));
create table TraitPlacement (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), sortOrder integer not null, createdById bigint, updatedById bigint, measuredQualityId bigint not null, parentPlacementId bigint, traitId bigint not null, primary key (id));
create table User (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, deletedAt datetime(6), consent bit not null, consentedAt datetime(6), dob date, email varchar(255) not null, gender varchar(20), lastLoginAt datetime(6), name varchar(150), phone varchar(20), status enum ('ACTIVE','INACTIVE','SUSPENDED') not null, isSuperAdmin bit not null, createdById bigint, updatedById bigint, primary key (id));
create table UserRole (id bigint not null auto_increment, createdAt datetime(6) not null, updatedAt datetime(6) not null, version bigint not null, createdById bigint, updatedById bigint, roleId bigint not null, userId bigint not null, primary key (id));
create index idxOptionItem on AnswerOption (itemId);
create index idxAssessmentQuestionnaire on Assessment (questionnaireId);
alter table AssessmentAttempt add constraint uqAttemptNumber unique (sessionId, attemptNumber);
create index idxAllotGroupGroup on AssessmentGroupAllotment (groupId);
alter table AssessmentGroupAllotment add constraint uqAllotAssessmentGroup unique (assessmentId, groupId);
create index idxAllotOrgOrganization on AssessmentOrganizationAllotment (organizationId);
alter table AssessmentOrganizationAllotment add constraint uqAllotAssessmentOrg unique (assessmentId, organizationId);
create index idxAllotUserUser on AssessmentRespondentAllotment (userId);
alter table AssessmentRespondentAllotment add constraint uqAllotAssessmentUser unique (assessmentId, userId);
create index idxSessionAssessment on AssessmentSession (assessmentId);
create index idxSessionUser on AssessmentSession (userId);
create index idxSessionOrganization on AssessmentSession (organizationId);
create index idxSessionGroup on AssessmentSession (groupId);
alter table DemographicField add constraint uqDemographicFieldKey unique (fieldKey);
create index idxDemographicOptionField on DemographicFieldOption (fieldId);
create index idxItemPrevious on Item (previousItemId);
create index idxItemUsageScorePlacement on ItemUsageTraitScore (placementId);
alter table ItemUsageTraitScore add constraint uqItemUsagePlacement unique (questionnaireItemId, placementId);
create index idxOptionUsageScorePlacement on OptionUsageTraitScore (placementId);
alter table OptionUsageTraitScore add constraint uqOptionUsagePlacement unique (questionnaireItemOptionId, placementId);
create index idxOrgMemberOrg on OrganizationMember (organizationId);
create index idxOrgMemberUser on OrganizationMember (userId);
create index idxQuestionnaireOrganization on Questionnaire (organizationId);
create index idxChangeLogQuestionnaire on QuestionnaireChangeLog (questionnaireId);
create index idxQuestionnaireFieldField on QuestionnaireDemographicField (fieldId);
alter table QuestionnaireDemographicField add constraint uqQuestionnaireField unique (questionnaireId, fieldId);
create index idxQuestionnaireItemQuestionnaire on QuestionnaireItem (questionnaireId);
create index idxQuestionnaireItemItem on QuestionnaireItem (itemId);
create index idxQuestionnaireItemSection on QuestionnaireItem (sectionId);
alter table QuestionnaireItem add constraint uqQuestionnaireItem unique (questionnaireId, itemId);
create index idxUsageOptionOption on QuestionnaireItemOption (optionId);
alter table QuestionnaireItemOption add constraint uqUsageOption unique (questionnaireItemId, optionId);
create index idxSectionQuestionnaire on QuestionnaireSection (questionnaireId);
create index idxGroupOrganization on RespondentGroup (organizationId);
create index idxGroupParent on RespondentGroup (parentGroupId);
create index idxGroupMemberGroup on RespondentGroupMember (groupId);
create index idxGroupMemberUser on RespondentGroupMember (userId);
alter table Role add constraint uqRoleName unique (name);
create index idxAnswerItem on SessionAnswer (itemId);
alter table SessionAnswer add constraint uqAnswerAttemptItem unique (attemptId, itemId);
create index idxAnswerOptionOption on SessionAnswerOption (optionId);
alter table SessionAnswerOption add constraint uqAnswerOption unique (answerId, optionId);
create index idxSessionDemographicField on SessionDemographic (fieldId);
alter table SessionDemographic add constraint uqDemographicAttemptField unique (attemptId, fieldId);
create index idxScorePlacement on SessionTraitScore (placementId);
alter table SessionTraitScore add constraint uqScoreAttemptPlacement unique (attemptId, placementId);
create index idxPlacementMq on TraitPlacement (measuredQualityId);
create index idxPlacementTrait on TraitPlacement (traitId);
create index idxPlacementParent on TraitPlacement (parentPlacementId);
alter table TraitPlacement add constraint uqPlacementMqTrait unique (measuredQualityId, traitId);
alter table User add constraint uqUserEmail unique (email);
create index idxUserRoleRole on UserRole (roleId);
alter table UserRole add constraint uqUserRole unique (userId, roleId);
alter table AnswerOption add constraint FKjit5q9yytklqsw2ngouq56g2a foreign key (createdById) references User (id);
alter table AnswerOption add constraint FK3praw599cot5hudv58na3cdfc foreign key (updatedById) references User (id);
alter table AnswerOption add constraint fkOptionItem foreign key (itemId) references Item (id);
alter table Assessment add constraint FKcoq4y41gaus8b250go57y70e4 foreign key (createdById) references User (id);
alter table Assessment add constraint FKfrk3dgwrey7glc2cyshbmuiab foreign key (updatedById) references User (id);
alter table Assessment add constraint fkAssessmentQuestionnaire foreign key (questionnaireId) references Questionnaire (id);
alter table AssessmentAttempt add constraint FKrbpa0u3i8r1kq13s6h3g26xxu foreign key (createdById) references User (id);
alter table AssessmentAttempt add constraint FKen6s6bqiolcg22whvj64wdmf0 foreign key (updatedById) references User (id);
alter table AssessmentAttempt add constraint fkAttemptSession foreign key (sessionId) references AssessmentSession (id);
alter table AssessmentGroupAllotment add constraint FK4fnruxa3blkuwkqfctyyarax9 foreign key (createdById) references User (id);
alter table AssessmentGroupAllotment add constraint FK6q1m95mxtj67g1lpuirmlrkuc foreign key (updatedById) references User (id);
alter table AssessmentGroupAllotment add constraint fkAllotGroupAssessment foreign key (assessmentId) references Assessment (id);
alter table AssessmentGroupAllotment add constraint fkAllotGroupGroup foreign key (groupId) references RespondentGroup (id);
alter table AssessmentLanguage add constraint fkAssessmentLanguageAssessment foreign key (assessmentId) references Assessment (id);
alter table AssessmentOrganizationAllotment add constraint FKndsqpytkxlcmjtiunqqt994kc foreign key (createdById) references User (id);
alter table AssessmentOrganizationAllotment add constraint FKs5cxsqu87hn215dry0lefrrsc foreign key (updatedById) references User (id);
alter table AssessmentOrganizationAllotment add constraint fkAllotOrgAssessment foreign key (assessmentId) references Assessment (id);
alter table AssessmentOrganizationAllotment add constraint fkAllotOrgOrganization foreign key (organizationId) references Organization (id);
alter table AssessmentRespondentAllotment add constraint FKknfq3lbo3qge2qn9dncdmlgwl foreign key (createdById) references User (id);
alter table AssessmentRespondentAllotment add constraint FKdkl88qi87hm8fqbhuqm8lhg6a foreign key (updatedById) references User (id);
alter table AssessmentRespondentAllotment add constraint fkAllotUserAssessment foreign key (assessmentId) references Assessment (id);
alter table AssessmentRespondentAllotment add constraint fkAllotUserUser foreign key (userId) references User (id);
alter table AssessmentSession add constraint FKqu0f7xebpnxjktoygqgql94h8 foreign key (createdById) references User (id);
alter table AssessmentSession add constraint FKilar99wso84nsgurq7y4fw2cu foreign key (updatedById) references User (id);
alter table AssessmentSession add constraint fkSessionAssessment foreign key (assessmentId) references Assessment (id);
alter table AssessmentSession add constraint fkSessionGroup foreign key (groupId) references RespondentGroup (id);
alter table AssessmentSession add constraint fkSessionOrganization foreign key (organizationId) references Organization (id);
alter table AssessmentSession add constraint fkSessionUser foreign key (userId) references User (id);
alter table DemographicField add constraint FKkfpgje9m7c06x7web2bp2ub5p foreign key (createdById) references User (id);
alter table DemographicField add constraint FKpo2adngf3dlpw4axwk7cjn7qi foreign key (updatedById) references User (id);
alter table DemographicFieldOption add constraint FKk0xfc2cedr9d72nm5d1s0g0l3 foreign key (createdById) references User (id);
alter table DemographicFieldOption add constraint FKnfmjv5ylaq2u1wmuwnx8vqp31 foreign key (updatedById) references User (id);
alter table DemographicFieldOption add constraint fkDemographicOptionField foreign key (fieldId) references DemographicField (id);
alter table Item add constraint FK4ttwjip68avj4tpup2o8t7jj8 foreign key (createdById) references User (id);
alter table Item add constraint FK94gsb81ut77hfcjwxr1t1vrs4 foreign key (updatedById) references User (id);
alter table Item add constraint fkItemPrevious foreign key (previousItemId) references Item (id);
alter table ItemLanguage add constraint fkItemLanguageItem foreign key (itemId) references Item (id);
alter table ItemUsageTraitScore add constraint FKonagwue2a9a12v8r49k9tt5s foreign key (createdById) references User (id);
alter table ItemUsageTraitScore add constraint FKc856b96govissrp8eye6c7lws foreign key (updatedById) references User (id);
alter table ItemUsageTraitScore add constraint fkItemUsageScorePlacement foreign key (placementId) references TraitPlacement (id);
alter table ItemUsageTraitScore add constraint fkItemUsageScoreUsage foreign key (questionnaireItemId) references QuestionnaireItem (id);
alter table MeasuredQuality add constraint FK3ec7kb9jgvhh1ln76mqvg7hav foreign key (createdById) references User (id);
alter table MeasuredQuality add constraint FKjgwwgjk6rvoocwj2k8wawjm25 foreign key (updatedById) references User (id);
alter table MeasuredQualityTrait add constraint FKdkh2ghikvhqqtthf2r4bg8qak foreign key (createdById) references User (id);
alter table MeasuredQualityTrait add constraint FKit87e2jkk15jgmu0y0kp7ykms foreign key (updatedById) references User (id);
alter table OptionUsageTraitScore add constraint FK32elyfvg19fyw0c4odqg4612k foreign key (createdById) references User (id);
alter table OptionUsageTraitScore add constraint FK3nwq39b3k0yt4wewsyl9lnxha foreign key (updatedById) references User (id);
alter table OptionUsageTraitScore add constraint fkOptionUsageScoreOptionUsage foreign key (questionnaireItemOptionId) references QuestionnaireItemOption (id);
alter table OptionUsageTraitScore add constraint fkOptionUsageScorePlacement foreign key (placementId) references TraitPlacement (id);
alter table Organization add constraint FK2tew7mx12gveyoo1mi33qqsrs foreign key (createdById) references User (id);
alter table Organization add constraint FKdlpe6wm8jldon39frjc57yuti foreign key (updatedById) references User (id);
alter table OrganizationMember add constraint FKqsqu28yvqglgqs7rcdptbjtwu foreign key (createdById) references User (id);
alter table OrganizationMember add constraint FK6ejy36r7gxn2gyqdfm328a3fq foreign key (updatedById) references User (id);
alter table OrganizationMember add constraint fkOrgMemberOrg foreign key (organizationId) references Organization (id);
alter table OrganizationMember add constraint fkOrgMemberUser foreign key (userId) references User (id);
alter table OrganizationModule add constraint fkOrgModuleOrg foreign key (organizationId) references Organization (id);
alter table OrganizationVertical add constraint fkOrgVerticalOrg foreign key (organizationId) references Organization (id);
alter table Questionnaire add constraint FKmjq6s51b5dq2xwf8112o1t9vk foreign key (createdById) references User (id);
alter table Questionnaire add constraint FKr472jajt4br7p76uq6v6whv9n foreign key (updatedById) references User (id);
alter table Questionnaire add constraint fkQuestionnaireOrganization foreign key (organizationId) references Organization (id);
alter table QuestionnaireChangeLog add constraint FKk4m2fkmpomfl4pa7ucenxc575 foreign key (createdById) references User (id);
alter table QuestionnaireChangeLog add constraint FK4p1eq7j4p9ntqwcbyn35bf5rh foreign key (updatedById) references User (id);
alter table QuestionnaireChangeLog add constraint fkChangeLogQuestionnaire foreign key (questionnaireId) references Questionnaire (id);
alter table QuestionnaireDemographicField add constraint FKn27js41gn3hf1ge4uxecsf4q2 foreign key (createdById) references User (id);
alter table QuestionnaireDemographicField add constraint FK7w73wxalu25qe6bc29ktrdbkf foreign key (updatedById) references User (id);
alter table QuestionnaireDemographicField add constraint fkQuestionnaireFieldField foreign key (fieldId) references DemographicField (id);
alter table QuestionnaireDemographicField add constraint fkQuestionnaireFieldQuestionnaire foreign key (questionnaireId) references Questionnaire (id);
alter table QuestionnaireItem add constraint FKimh9b858t10eop7ylccx990re foreign key (createdById) references User (id);
alter table QuestionnaireItem add constraint FKit0esohkadsqi6xvdq9thckrn foreign key (updatedById) references User (id);
alter table QuestionnaireItem add constraint fkQuestionnaireItemItem foreign key (itemId) references Item (id);
alter table QuestionnaireItem add constraint fkQuestionnaireItemQuestionnaire foreign key (questionnaireId) references Questionnaire (id);
alter table QuestionnaireItem add constraint fkQuestionnaireItemSection foreign key (sectionId) references QuestionnaireSection (id);
alter table QuestionnaireItemOption add constraint FKas74ai13avk8wgannfo3vup10 foreign key (createdById) references User (id);
alter table QuestionnaireItemOption add constraint FKf9r5l5h3i018j4vhq9vxkbqu6 foreign key (updatedById) references User (id);
alter table QuestionnaireItemOption add constraint fkUsageOptionOption foreign key (optionId) references AnswerOption (id);
alter table QuestionnaireItemOption add constraint fkUsageOptionUsage foreign key (questionnaireItemId) references QuestionnaireItem (id);
alter table QuestionnaireSection add constraint FKssil46d3pwm3fdpgbj8tvnnwk foreign key (createdById) references User (id);
alter table QuestionnaireSection add constraint FKinrsxqfmhwtphbygim6r1l0pt foreign key (updatedById) references User (id);
alter table QuestionnaireSection add constraint fkSectionQuestionnaire foreign key (questionnaireId) references Questionnaire (id);
alter table RespondentGroup add constraint FKstrth5ldr9r7u9v17qucy2ekg foreign key (createdById) references User (id);
alter table RespondentGroup add constraint FK8ko9cnlfrc9awkmhmo0jx720k foreign key (updatedById) references User (id);
alter table RespondentGroup add constraint fkGroupOrganization foreign key (organizationId) references Organization (id);
alter table RespondentGroup add constraint fkGroupParent foreign key (parentGroupId) references RespondentGroup (id);
alter table RespondentGroupMember add constraint FKdnqf7qq5buqa7p4lcm4f7byi5 foreign key (createdById) references User (id);
alter table RespondentGroupMember add constraint FKe7d3sh0nmae9gvtdbj5xlxqde foreign key (updatedById) references User (id);
alter table RespondentGroupMember add constraint fkGroupMemberGroup foreign key (groupId) references RespondentGroup (id);
alter table RespondentGroupMember add constraint fkGroupMemberUser foreign key (userId) references User (id);
alter table Role add constraint FK5cajr341oj4kw5dtjihka3mw7 foreign key (createdById) references User (id);
alter table Role add constraint FKfxre6wg8u9x6jajxm595dbs4i foreign key (updatedById) references User (id);
alter table RoleUrlPath add constraint fkRoleUrlPathRole foreign key (roleId) references Role (id);
alter table SessionAnswer add constraint FKh932dn90i1wq7rxfm3jyanq4p foreign key (createdById) references User (id);
alter table SessionAnswer add constraint FK6cai2aykrx7wugolnj1iutprh foreign key (updatedById) references User (id);
alter table SessionAnswer add constraint fkAnswerAttempt foreign key (attemptId) references AssessmentAttempt (id);
alter table SessionAnswer add constraint fkAnswerItem foreign key (itemId) references Item (id);
alter table SessionAnswerOption add constraint FK4vu83hcx9w1xs6oqj9k8v2b87 foreign key (createdById) references User (id);
alter table SessionAnswerOption add constraint FKin80ocjin079e1cnwf1qsmtkg foreign key (updatedById) references User (id);
alter table SessionAnswerOption add constraint fkAnswerOptionAnswer foreign key (answerId) references SessionAnswer (id);
alter table SessionAnswerOption add constraint fkAnswerOptionOption foreign key (optionId) references AnswerOption (id);
alter table SessionDemographic add constraint FKied4m3l6cwtv8cjb024t13rtu foreign key (createdById) references User (id);
alter table SessionDemographic add constraint FKjsmhvgwra1k4i1k7j75hknt2w foreign key (updatedById) references User (id);
alter table SessionDemographic add constraint fkSessionDemographicAttempt foreign key (attemptId) references AssessmentAttempt (id);
alter table SessionDemographic add constraint fkSessionDemographicField foreign key (fieldId) references DemographicField (id);
alter table SessionTraitScore add constraint FKj4hx6bph37qw1olbcqft7sju0 foreign key (createdById) references User (id);
alter table SessionTraitScore add constraint FK7ng65o23xevrx4kaq2o6uruvk foreign key (updatedById) references User (id);
alter table SessionTraitScore add constraint fkScoreAttempt foreign key (attemptId) references AssessmentAttempt (id);
alter table SessionTraitScore add constraint fkScorePlacement foreign key (placementId) references TraitPlacement (id);
alter table TraitPlacement add constraint FKhdp4miit4hr1kjl9lqgsjtdfp foreign key (createdById) references User (id);
alter table TraitPlacement add constraint FKnwin5ubnycrgghcummq9kew12 foreign key (updatedById) references User (id);
alter table TraitPlacement add constraint fkPlacementMq foreign key (measuredQualityId) references MeasuredQuality (id);
alter table TraitPlacement add constraint fkPlacementParent foreign key (parentPlacementId) references TraitPlacement (id);
alter table TraitPlacement add constraint fkPlacementTrait foreign key (traitId) references MeasuredQualityTrait (id);
alter table User add constraint FKs6apjhvoxa3lxtpmwxhgu26an foreign key (createdById) references User (id);
alter table User add constraint FK7uj01mwn4312e8cff903ho7by foreign key (updatedById) references User (id);
alter table UserRole add constraint FK9loc19ob2q5x9o2y853ku6mr8 foreign key (createdById) references User (id);
alter table UserRole add constraint FKi9219p75q6vxfcp0bhvmp17o7 foreign key (updatedById) references User (id);
alter table UserRole add constraint fkUserRoleRole foreign key (roleId) references Role (id);
alter table UserRole add constraint fkUserRoleUser foreign key (userId) references User (id);

-- ─────────────────────────────────────────────────────────────────────────
-- Hardening beyond what JPA can express
-- ─────────────────────────────────────────────────────────────────────────

-- TraitPlacement: a parent placement must belong to the SAME MeasuredQuality.
alter table TraitPlacement add constraint uqPlacementIdMq unique (id, measuredQualityId);
alter table TraitPlacement add constraint fkPlacementParentSameMq
    foreign key (parentPlacementId, measuredQualityId)
    references TraitPlacement (id, measuredQualityId);

-- RespondentGroup: a parent group must belong to the SAME Organization.
alter table RespondentGroup add constraint uqGroupIdOrg unique (id, organizationId);
alter table RespondentGroup add constraint fkGroupParentSameOrg
    foreign key (parentGroupId, organizationId)
    references RespondentGroup (id, organizationId);

-- (QuestionnaireItemOption same-item integrity stays a service invariant —
--  hardening it would need a denormalized itemId column on the edge.)

-- ─────────────────────────────────────────────────────────────────────────
-- Migration bookkeeping (permanent: the old-UUID → new-id memory)
-- ─────────────────────────────────────────────────────────────────────────

create table LegacyIdMap (
    id bigint not null auto_increment,
    entityType varchar(50) not null,
    legacyId varchar(128) not null,
    newId bigint not null,
    primary key (id),
    constraint uqLegacyIdMap unique (entityType, legacyId)
);
create index idxLegacyIdMapNew on LegacyIdMap (entityType, newId);

create table MigrationNote (
    id bigint not null auto_increment,
    severity varchar(10) not null,
    entityType varchar(50),
    legacyId varchar(128),
    note text not null,
    createdAt timestamp(6) not null default current_timestamp(6),
    primary key (id)
);
