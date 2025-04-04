if ( devopsLibrary.rescheduleWhenBranchIndexing() )
{
  return
}

def scmInfo = []
def branchName = ''

pipeline
{
  agent
  {
    node
    {
      label 'gcp-datascience-dh1'
      customWorkspace "/opt/jenkins/workspace/${JOB_NAME}/${BUILD_NUMBER}"
    }
  }

  options
  {
    disableConcurrentBuilds()
    skipDefaultCheckout()
  }

  triggers
  {
    pollSCM( 'H/10 * * * *' )
  }

  stages
  {
    stage( 'Source checkout' )
    {
      steps
      {
        script
        {
          scmInfo = checkout scm
          echo "scm: ${scmInfo}"
          echo "${scmInfo.GIT_COMMIT}"

          if ( scmInfo?.GIT_LOCAL_BRANCH )
          {
            branchName = scmInfo.GIT_LOCAL_BRANCH
          }
          else if ( scmInfo?.GIT_BRANCH )
          {
            branchName = scmInfo.GIT_BRANCH
          }
        }
      }
    }

    stage( 'Clean environment before run' )
    {
      when
      {
        branch pattern: '^((main|master|qa|release)$|(qa|release)(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        script
        {
          devopsLibrary.stopContainers( 'avalon-' )
          devopsLibrary.removeUnusedDockerResources()
        }
      }
    }

    stage( 'Run static code tests in staging' )
    {
      when
      {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        sh '''
          [ ! -f Makefile.tests ] || make -f Makefile.tests all-static
        '''
      }
    }

    stage( 'Run containers for development' )
    {
      when
      {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        // Utilizzo di withCredentials per generare dinamicamente i file .env
        withCredentials([
          string(credentialsId: 'BACKEND_ENV_SECRET', variable: 'BACKEND_SECRET'),
          string(credentialsId: 'ARCHIMEDES_ENV_SECRET', variable: 'ARCHIMEDES_SECRET')
        ]) {
          sh '''
            # Genera il file .env per il backend con le variabili necessarie
            echo "PASSWORD=${BACKEND_SECRET}" > backend/.env
            # Genera il file .env per Archimedes2.0 se necessario
            echo "PASSWORD=${ARCHIMEDES_SECRET}" > Archimedes2.0/.env
            # Avvia i container tramite Docker Compose
            sudo docker compose -p avalon -f docker-compose.prod.yaml up -d
          '''
        }
      }
    }

    stage( 'Run tests on running code in staging' )
    {
      when
      {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        sh '''
          [ ! -f Makefile.tests ] || make -f Makefile.tests all-dynamic
        '''
      }
    }
  }

  post
  {
    always
    {
      script
      {
        devopsLibrary.wsCleanup( JOB_NAME, [ keepIndexingRuns : false, buildsToKeepThreshold : 15 ] )
      }
    }

    success
    {
      script
      {
        if ( branchName.matches( '^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)' ) )
        {
          devopsLibrary.discordSuccess()
        }
      }
    }

    failure
    {
      script
      {
        if ( branchName.matches( '^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)' ) )
        {
          devopsLibrary.discordFailure(
            currentBuild.rawBuild.getLog( 500 ),
            [
              maxErrors : 2,
              maxExceptions : 0,
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
