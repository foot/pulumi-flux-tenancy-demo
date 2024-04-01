import * as pulumi from "@pulumi/pulumi";
import { TenantResourceArgs, TenantSystem, TenantResource } from "./tenancy";

// config

const githubConfig = new pulumi.Config("github");
export const githubOwner = githubConfig.require("owner");

const tenancyConfig = new pulumi.Config("tenancy");
const tenants = tenancyConfig.requireObject("tenants") as TenantResourceArgs[];

// make some resources

const tenantSystem = new TenantSystem("acme-corp-tenants", { githubOwner });

for (const tenant of tenants) {
  new TenantResource(
    tenant.name,
    {
      ...tenant,
      githubOwner,
    },
    { dependsOn: tenantSystem }
  );
}

export const tenantSystemGitRepositoryName = tenantSystem.gitRepository.name;
