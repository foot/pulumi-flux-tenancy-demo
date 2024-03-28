import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";
import * as github from "@pulumi/github";
import * as flux from "@worawat/flux";

// Require Github configurations
// export GITHUB_TOKEN=your-github-personal-access-token
// export GITHUB_OWNER=your-github-owner

const knownHosts =
  "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=";

const fluxNamespace = "flux-system";

interface TenantResourceArgs {
  name: string;
  namespaces: string[];
}

class TenantResource extends pulumi.ComponentResource {
  public readonly gitRepository: github.Repository;

  constructor(
    name: string,
    args: TenantResourceArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("flux:tenancy:Tenant", name, args, opts);

    const resourceName = (key: string) => `${args.name}-${key}`;
    const repoName = resourceName("workspace");
    const baseOptions: pulumi.ComponentResourceOptions = { parent: this };

    // Generate ssh keys
    const key = new tls.PrivateKey(
      resourceName("private-key"),
      {
        algorithm: "ECDSA",
        ecdsaCurve: "P256",
      },
      baseOptions
    );

    // Create Github repository
    this.gitRepository = new github.Repository(
      resourceName("repository"),
      {
        name: repoName,
        visibility: "private",
        autoInit: true,
      },
      baseOptions
    );

    new github.RepositoryDeployKey(
      resourceName("repository-deploy-key"),
      {
        title: "fluxcd",
        repository: this.gitRepository.name,
        key: key.publicKeyOpenssh,
        readOnly: false,
      },
      baseOptions
    );

    new github.BranchDefault(
      resourceName("branch-default"),
      {
        repository: this.gitRepository.name,
        branch,
      },
      { ...baseOptions, dependsOn: this.gitRepository }
    );

    const fluxSecretName = resourceName("flux-secret");

    new k8s.core.v1.Secret(
      resourceName("flux-secret"),
      {
        metadata: {
          name: fluxSecretName,
          namespace: fluxNamespace,
        },
        stringData: {
          identity: key.privateKeyPem,
          "identity.pub": key.publicKeyPem,
          known_hosts: knownHosts,
        },
      },
      baseOptions
    );

    // add ks and source
    flux
      .getFluxSync({
        name: resourceName("automation"),
        targetPath: "clusters/my-cluster",
        url: `ssh://git@github.com/${githubOwner}/${repoName}.git`,
        branch: branch,
        secret: fluxSecretName,
      })
      .then((fluxSync) => {
        // TODO: needs to depend on flux bootstrap.
        new k8s.yaml.ConfigGroup(
          resourceName("flux-sync"),
          {
            yaml: fluxSync.content,
          },
          baseOptions
        );
      })
      .then(() => {
        // Register output properties for this component
        this.registerOutputs();
      });
  }
}

const branch = "main";
const path = "kubernetes";
const githubOwner = "foot-org";

function setupAdmin() {
  const repoName = "workspace-admin";
  const resourceName = (key: string) => `${repoName}-${key}`;

  // Generate ssh keys
  const key = new tls.PrivateKey(resourceName("private-key"), {
    algorithm: "ECDSA",
    ecdsaCurve: "P256",
  });

  // Create Github repository
  const repo = new github.Repository(resourceName("repository"), {
    name: repoName,
    visibility: "private",
    autoInit: true,
  });

  new github.BranchDefault(resourceName("branch-default"), {
    repository: repo.name,
    branch,
  });

  // Add generated public key to Github deploy key
  const deployKey = new github.RepositoryDeployKey(
    resourceName("repository-deploy-key"),
    {
      title: "fluxcd",
      repository: repo.name,
      key: key.publicKeyOpenssh,
      readOnly: false,
    }
  );

  const provider = new flux.Provider("flux", {
    kubernetes: {
      configPath: "~/.kube/config",
    },
    git: {
      url: `ssh://git@github.com/${githubOwner}/${repoName}.git`,
      branch,
      ssh: {
        username: "git",
        privateKey: key.privateKeyPem,
      },
    },
  });

  const resource = new flux.FluxBootstrapGit(
    "flux",
    {
      path: path,
    },
    {
      provider: provider,
      dependsOn: deployKey,
    }
  );
}

setupAdmin();

const tenant = new TenantResource("ai-team", {
  name: "ai-team",
  namespaces: ["ai", "observability"],
});

export const gitRepositoryName = tenant.gitRepository.name;
