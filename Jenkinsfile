if ( devopsLibrary.rescheduleWhenBranchIndexing() ) {
  return
}

def scmInfo = []
def branchName = ''

pipeline {
  agent {
    node {
      label 'gcp-datascience-dh1'
      customWorkspace "/opt/jenkins/workspace/${JOB_NAME}/${BUILD_NUMBER}"
    }
  }

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout()
  }

  triggers {
    pollSCM('H/10 * * * *')
  }

  stages {
    stage('Source checkout') {
      steps {
        script {
          scmInfo = checkout scm
          echo "scm: ${scmInfo}"
          echo "${scmInfo.GIT_COMMIT}"
          if ( scmInfo?.GIT_LOCAL_BRANCH ) {
            branchName = scmInfo.GIT_LOCAL_BRANCH
          } else if ( scmInfo?.GIT_BRANCH ) {
            branchName = scmInfo.GIT_BRANCH
          }
        }
      }
    }
    
    stage('Clean environment before run') {
      when {
        branch pattern: '^((main|master|qa|release)$|(qa|release)(/|-).+)', comparator: "REGEXP"
      }
      steps {
        script {
          devopsLibrary.stopContainers('avalon-')
          devopsLibrary.removeUnusedDockerResources()
        }
      }
    }
    
    stage('Run static code tests in staging') {
      when {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps {
        sh '''
          [ ! -f Makefile.tests ] || make -f Makefile.tests all-static
        '''
      }
    }
    
    stage('Run containers for development') {
      when {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps {
        withCredentials([
          file(credentialsId: 'BACKEND_ENV_SECRET', variable: 'BACKEND_ENV_PATH'),
          file(credentialsId: 'ARCHIMEDES_ENV_SECRET', variable: 'ARCHIMEDES_ENV_PATH'),
          file(credentialsId: 'FIRESTORE_CREDENTIALS_FILE', variable: 'FIRESTORE_CREDENTIALS_PATH')
        ]) {
          sh '''
            # Leggi il contenuto dei file dei secret per BACKEND e ARCHIMEDES
            export BACKEND_ENV=$(cat "$BACKEND_ENV_PATH")
            export ARCHIMEDES_ENV="$(cat "$ARCHIMEDES_ENV_PATH")"
            
            # Estrai EMAIL_PASSWORD e EMAIL_USER dal file BACKEND_ENV_SECRET
            export EMAIL_PASSWORD=$(grep '^EMAIL_PASSWORD=' "$BACKEND_ENV_PATH" | cut -d'=' -f2-)
            export EMAIL_USER=$(grep '^DEFAULT_ADMIN_EMAIL=' "$BACKEND_ENV_PATH" | cut -d'=' -f2-)
            
            # Per debug (attenzione: non loggare in produzione le credenziali)
            echo "BACKEND_ENV=$BACKEND_ENV"
            echo "ARCHIMEDES_ENV=$ARCHIMEDES_ENV"
            echo "EMAIL_USER=$EMAIL_USER"
            echo "EMAIL_PASSWORD length: $(echo -n "$EMAIL_PASSWORD" | wc -c)"
            
            # Crea la cartella per i segreti se non esiste e copia il file di Firestore
            mkdir -p secrets
            cp "$FIRESTORE_CREDENTIALS_PATH" secrets/credentials.json
            
            # Scrive un file env.tmp senza spazi iniziali per Docker Compose
cat <<EOF > env.tmp
BACKEND_ENV=${BACKEND_ENV}
ARCHIMEDES_ENV=${ARCHIMEDES_ENV}
EMAIL_PASSWORD=${EMAIL_PASSWORD}
EMAIL_USER=${EMAIL_USER}
EOF

            # Avvia i container tramite Docker Compose usando il file env.tmp
            sudo docker compose -p avalon -f docker-compose.prod.yaml --env-file env.tmp up -d --force-recreate
          '''
        }
      }
    }
    
    stage('Run tests on running code in staging') {
      when {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps {
        sh '''
          [ ! -f Makefile.tests ] || make -f Makefile.tests all-dynamic
        '''
      }
    }
  }
  
  post {
    always {
      script {
        devopsLibrary.wsCleanup(JOB_NAME, [ keepIndexingRuns: false, buildsToKeepThreshold: 15 ])
      }
    }
    success {
      script {
        if ( branchName.matches('^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)') ) {
          devopsLibrary.discordSuccess()
        }
      }
    }
    failure {
      script {
        if ( branchName.matches('^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)') ) {
          devopsLibrary.discordFailure(
            currentBuild.rawBuild.getLog(500),
            [
              maxErrors: 2,
              maxExceptions: 0,
              maxWarnings: 0,
              contextBefore: 0,
              contextAfter: 4
            ]
          )
        }
      }
    }
  }
}
